package handlers

import (
	"bufio"
	"fmt"
	"log"
	"net/url"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

// SSEHandler handles Server-Sent Events for real-time progress updates
func SSEHandler(currentSessions *session.SessionsLock) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("Transfer-Encoding", "chunked")

		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = fmt.Sprintf("%s", repo)

		log.Printf("New Request %s\n", repo)

		stateChan := make(chan int)

		s := session.Session{
			Repo:         repo,
			StateChannel: stateChan,
		}

		currentSessions.AddSession(&s)

		notify := c.Context().Done()

		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			keepAliveTickler := time.NewTicker(15 * time.Second)
			keepAliveMsg := ":keepalive\n"

			go func() {
				<-notify
				log.Printf("Stopped Request\n")
				currentSessions.RemoveSession(&s)
				keepAliveTickler.Stop()
			}()

			for loop := true; loop; {
				select {
				case ev := <-stateChan:
					sseMessage, err := session.FormatSSEMessage("current-value", ev)
					if err != nil {
						log.Printf("Error formatting sse message: %v\n", err)
						continue
					}

					_, err = fmt.Fprintf(w, sseMessage)
					if err != nil {
						log.Printf("Error while writing Data: %v\n", err)
						continue
					}

					err = w.Flush()
					if err != nil {
						log.Printf("Error while flushing Data: %v\n", err)
						currentSessions.RemoveSession(&s)
						keepAliveTickler.Stop()
						loop = false
						break
					}

				case <-keepAliveTickler.C:
					fmt.Fprintf(w, keepAliveMsg)
					err := w.Flush()
					if err != nil {
						log.Printf("Error while flushing: %v.\n", err)
						currentSessions.RemoveSession(&s)
						keepAliveTickler.Stop()
						loop = false
						break
					}
				}
			}

			log.Println("Exiting stream")
		}))

		return nil
	}
}

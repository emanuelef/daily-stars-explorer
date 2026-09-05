package otel_instrumentation

import (
	"context"
	"log"

	_ "github.com/joho/godotenv/autoload"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Used to initialise the global OpenTelemetry trace provider and exporter
func InitializeGlobalTracerProvider(ctx context.Context) (*sdktrace.TracerProvider, *otlptrace.Exporter, error) {
	// Configure a new OTLP exporter using environment variables for sending data to Honeycomb over gRPC
	clientOTel := otlptracegrpc.NewClient()
	exp, err := otlptrace.New(ctx, clientOTel)
	if err != nil {
		log.Fatalf("failed to initialize exporter: %e", err)
	}

	// NewSchemaless, not NewWithAttributes: resource.Merge refuses to merge two
	// resources that declare different schema URLs, and resource.Default()
	// tracks whichever semconv version the SDK was built against. Pinning our
	// own semconv version here meant every SDK bump that moved that version
	// crashed startup (v1.46.0 moved it to 1.43.0 against a hardcoded 1.41.0).
	// A schemaless resource merges cleanly with any of them.
	res, rErr := resource.Merge(
		resource.Default(),
		resource.NewSchemaless(
			attribute.String("environment", "test"),
		),
	)

	// A resource that failed to merge is not worth crashing the server over —
	// fall back to the default so tracing degrades instead of taking the app
	// down.
	if rErr != nil {
		log.Printf("otel: falling back to the default resource: %v", rErr)
		res = resource.Default()
	}

	// Create a new tracer provider with a batch span processor and the otlp exporter
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(res),
	)

	// Register the global Tracer provider
	otel.SetTracerProvider(tp)

	// Register the W3C trace context and baggage propagators so data is propagated across services/processes
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	return tp, exp, nil
}

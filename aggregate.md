# Aggregations and trends

The "aggregate" option provides flexibility in how data is aggregated within the graph, allowing users to modify the visualization to display trends more effectively. 

## None
<img width="1362" alt="Screenshot 2024-03-14 at 20 06 44" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/13cb68a9-adaf-42df-88db-29484f33f3a9">

The graph is display with an automatic binning, aggregating depending on zooming level.  
When zooming in is possible to see each day with the actual number of new stars on that day:

<img width="1340" alt="Screenshot 2024-03-14 at 20 07 20" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/24b95d34-1d44-48f9-802c-77dae22eb080">

## Trend

The trend is generated using [Prophet](https://github.com/facebook/prophet) in a separate [repo](https://github.com/emanuelef/daily-stars-predictor)

<img width="1362" alt="Screenshot 2024-03-14 at 20 13 21" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/8011300a-240d-47c1-b8ac-a69f5512c0b7">

## Yearly Binning

The data is aggregated by year regardless of the zooming. The value is the daily average per year.

<img width="1370" alt="Screenshot 2024-03-14 at 20 14 37" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/3bd9e977-1e31-4a72-aa4e-64e66a7b6c03">

## Monthly Binning

The data is aggregated by month regardless of the zooming. The value is the daily average per month.

<img width="1367" alt="Screenshot 2024-03-14 at 20 15 07" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/a358c5a5-bfd7-4333-bcc5-3ff12bb7d146">

## Weekly Binning

The data is aggregated by week regardless of the zooming. The value is the daily average per week.

<img width="1369" alt="Screenshot 2024-03-14 at 20 15 47" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/771f02c9-5ab8-4469-862a-a72d8f4b09e8">

## Normalize

Some repo like [twbs/bootstrap](https://emanuelef.github.io/daily-stars-explorer/#/twbs/bootstrap) shows a spike at the beginning that is making the rest of the days look flat.
It's always possible to manually zoom in, but in that case the normalize option can help.

<img width="1367" alt="Screenshot 2024-03-14 at 20 21 41" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/9402696a-0f23-445c-a4fe-29a10c18bc3e">

Normalize options calculates the 98 percentile of all non zero values and replaces all the values above that with it.

<img width="1366" alt="Screenshot 2024-03-14 at 20 23 30" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/81659bae-c7e6-4151-8000-e69be6d4aec5">


## LOESS

## Running Average

## Running Median

## Derivative

## Second Derivative


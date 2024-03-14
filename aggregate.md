# Aggregations and trends

The "aggregate" option provides flexibility in how data is aggregated within the graph, allowing users to modify the visualization to display trends more effectively. 

## None
<img width="862" alt="Screenshot 2024-03-14 at 20 06 44" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/13cb68a9-adaf-42df-88db-29484f33f3a9">

The graph is display with an automatic binning, aggregating depending on zooming level.  
When zooming in is possible to see each day with the actual number of new stars on that day:

<img width="840" alt="Screenshot 2024-03-14 at 20 07 20" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/24b95d34-1d44-48f9-802c-77dae22eb080">

## Trend

The trend is generated using [Prophet](https://github.com/facebook/prophet) in a separate [repo](https://github.com/emanuelef/daily-stars-predictor)

<img width="862" alt="Screenshot 2024-03-14 at 20 13 21" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/8011300a-240d-47c1-b8ac-a69f5512c0b7">

## Yearly Binning

The data is aggregated by year regardless of the zooming. The value is the daily average per year.

<img width="870" alt="Screenshot 2024-03-14 at 20 14 37" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/3bd9e977-1e31-4a72-aa4e-64e66a7b6c03">

## Monthly Binning

The data is aggregated by month regardless of the zooming. The value is the daily average per month.

<img width="867" alt="Screenshot 2024-03-14 at 20 15 07" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/a358c5a5-bfd7-4333-bcc5-3ff12bb7d146">

## Weekly Binning

The data is aggregated by week regardless of the zooming. The value is the daily average per week.

<img width="869" alt="Screenshot 2024-03-14 at 20 15 47" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/771f02c9-5ab8-4469-862a-a72d8f4b09e8">

## Normalize

Some repo like [twbs/bootstrap](https://emanuelef.github.io/daily-stars-explorer/#/twbs/bootstrap) shows a spike at the beginning that is making the rest of the days look flat.
It's always possible to manually zoom in, but in that case the normalize option can help.

<img width="867" alt="Screenshot 2024-03-14 at 20 21 41" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/9402696a-0f23-445c-a4fe-29a10c18bc3e">

Normalize options calculates the 98 percentile of all non zero values and replaces all the values above that with it.

<img width="866" alt="Screenshot 2024-03-14 at 20 23 30" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/81659bae-c7e6-4151-8000-e69be6d4aec5">


## LOESS

Calcualted LOESS regression using https://github.com/HarryStevens/d3-regression?tab=readme-ov-file#regressionLoess

<img width="864" alt="Screenshot 2024-03-14 at 21 24 42" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/465676e3-44bf-4c8a-a7ec-90f9be40af2b">

## Running Average

Running average on a fixed 120 day window

<img width="827" alt="Screenshot 2024-03-14 at 21 26 13" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/13eb0758-e12b-42dc-aa30-572e556b6d4f">

## Running Median

Not sure this is really used or just something I tried but this is the running median on a fixed 120 day window

<img width="813" alt="Screenshot 2024-03-14 at 21 27 20" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/f3de0fd5-0bc4-4ccd-bebf-3981a4679621">

## Derivative

The first-order derivative of a measure represents the rate of change or the slope of the measure's curve at any given point. In other words, it indicates how quickly the new stars are increasing or decreasing atthat point.
Since the daily stars are quite noisy the first derivative amplifies that noise, might worth trying to calculate it after smoothing the timeseries.


<img width="806" alt="Screenshot 2024-03-14 at 21 28 11" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/87311c3c-85c8-462c-8bc0-17bc2ad14f30">

## Second Derivative

Second order discrete derivative.
Should indicate the acceleration of the new stars, porsitve values mean it is accelerating.

<img width="813" alt="Screenshot 2024-03-14 at 21 30 09" src="https://github.com/emanuelef/daily-stars-explorer/assets/48717/b275decc-8394-4c8f-a3b7-9d3d7bca5f43">


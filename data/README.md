# Place data

These committed gazetteers contain OpenStreetMap streets and landmarks for Vincennes and central Kyiv.
The application reads them locally. It does not call a geocoding service or download map tiles.
Each file records its source, build date, bounds and features.

To rebuild an area from Overpass, run `npm run gazetteer -- vincennes` or `npm run gazetteer -- kyiv`.
This optional maintenance command needs internet. It is not part of installation or startup.

Map data © OpenStreetMap contributors, licensed under the ODbL: https://www.openstreetmap.org/copyright

# Torn live location travel map

My custom updated version of Justlucdewit's Live Location Travel Map TamperMonkey script for Torn.com

changes include:

Curved Flight Paths: The flight line is no longer a straight line. The script now calculates a quadratic Bezier curve, simulating a flight arc that bows slightly based on the distance.
Movement Smoothing: CSS transitions have been added to the plane's movement, ensuring smoothness between frame updates.
Progress Visualization: The path is now split into two distinct visual styles:
  Traveled Path: A solid teal line with a glowing shadow.
  Remaining Path: A white dotted line.
Country Flags: Instead of red dots, the script now loads and places country flag icons for each destination (e.g., flags/fl_uk.svg).
Glow Effect: The plane icon now has a CSS animation (planeGlow) that makes it subtly pulse and glow.
Vignette Overlay: A vignette has been added over the map.
Mobile Device Support: Uses a responsive <img /> tag for the background rather than a forced height of 400px, allowing the map to scale correctly on mobile devices.
Map Image Source: The map background has changed from using the GitHub repository's image to the official Torn map file (https://www.torn.com/images/v2/travel_agency/map.png).
Coordinate Accuracy: The coordinate locations for countries have been tweaked slightly for better alignment with the new map background.

// ==UserScript==
// @name        Torn Location Based Travel Map
// @namespace   http://tampermonkey.net/
// @version     2025-12-05
// @description Replaces the plane in torn travel page with a live location map
// @author      justlucdewit
// @match       https://www.torn.com/page.php?sid=travel*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=torn.com
// ==/UserScript==

(function () {
    'use strict';

    
    const MAP_BG_URL = 'https://www.torn.com/images/v2/travel_agency/map.png';

    // Location coordinates (in percentage of canvas size)
    const LOCATIONS = {
        'torn': { x: 51, y: 46 },
        'mexico': { x: 46, y: 46 },
        'cayman-islands': { x: 54, y: 52 },
        'canada': { x: 54.25, y: 36 },
        'hawaii': { x: 33, y: 49 },
        'uk': { x: 75.5, y: 31.5 },
        'argentina': { x: 59.5, y: 82 },
        'switzerland': { x: 78.25, y: 34.5 },
        'japan': { x: 15, y: 42 },
        'uae': { x: 90.75, y: 48.5 },
        'china': { x: 9, y: 39 },
        'south-africa': { x: 83.5, y: 77.25 }
    };

    // Cache of created flag marker elements
    let flagElements = {};

    const ensureStyles = () => {
        if (document.getElementById('torn-flight-map-style')) return;
        const style = document.createElement('style');
        style.id = 'torn-flight-map-style';
        style.textContent = `
@keyframes planeGlow {
  0%   { filter: drop-shadow(0 0 4px rgba(255,255,255,0.6)) drop-shadow(0 0 8px rgba(255,80,80,0.4)) drop-shadow(0 0 14px rgba(255,100,100,0.2)); text-shadow: -1px -1px 0 rgba(0,0,0,0.2), 1px -1px 0 rgba(0,0,0,0.2), -1px 1px 0 rgba(0,0,0,0.2), 1px 1px 0 rgba(0,0,0,0.2); }
  100% { filter: drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 0 12px rgba(255,80,80,0.7)) drop-shadow(0 0 20px rgba(255,100,100,0.4)); text-shadow: -1px -1px 0 rgba(0,0,0,0.2), 1px -1px 0 rgba(0,0,0,0.2), -1px 1px 0 rgba(0,0,0,0.2), 1px 1px 0 rgba(0,0,0,0.2); }
}
        `;
        document.head.appendChild(style);
    };

    // Compute a curved control point to mimic great-circle-ish arc
    const computeControlPoint = (dep, dest) => {
        const midX = (dep.x + dest.x) / 2;
        const midY = (dep.y + dest.y) / 2;

        // Vector perpendicular to the line dep->dest
        const dx = dest.x - dep.x;
        const dy = dest.y - dep.y;
        const length = Math.hypot(dx, dy) || 1;

        // Normalize perpendicular (rotate 90°)
        const nx = -dy / length;
        const ny = dx / length;

        // Offset magnitude scales with distance (so longer flights bow more)
        const bow = Math.min(0.25 * length, 25); // cap bow to avoid extreme curves

        return {
            x: midX + nx * bow,
            y: midY + ny * bow
        };
    };

    const renderFrame = (canvas, ctx, markerLayer) => {
        const rect = canvas.getBoundingClientRect();
        const canvas_width = rect.width;
        const canvas_height = rect.height;
        canvas.width = canvas_width;
        canvas.height = canvas_height;

        ctx.clearRect(0, 0, canvas_width, canvas_height);


        // Render flag markers
        if (markerLayer) {
            Object.entries(LOCATIONS).forEach(([locKey, loc]) => {
                const real_x = canvas.width / 100 * loc.x;
                const real_y = canvas.height / 100 * loc.y;

                // Ensure element exists
                if (!flagElements[locKey]) {
                    const img = document.createElement('img');
                    const flName = `fl_${locKey.replace(/-/g, '_')}`;
                    img.src = `https://www.torn.com/images/v2/travel_agency/flags/${flName}.svg`;
                    img.alt = locKey;
                    img.style.position = 'absolute';
                    img.style.width = '16px';
                    img.style.height = '16px';
                    img.style.pointerEvents = 'none';
                    img.style.transform = 'translate(-50%, -50%)';
                    img.style.filter = 'drop-shadow(0 0 2px rgba(0,0,0,0.6))';
                    img.style.zIndex = '1';
                    img.className = 'flag-marker';
                    markerLayer.appendChild(img);
                    flagElements[locKey] = img;
                }

                // Update position each frame to follow resizing
                const el = flagElements[locKey];
                el.style.left = `${real_x}px`;
                el.style.top = `${real_y}px`;
            });
        }

        // Calculate flight percentage
        const flight_progress_bar = document.querySelector('div[class^="flightProgressBar__"]');
        if (!flight_progress_bar) return;

        const fillEl = flight_progress_bar.querySelector('div[class^="fill__"]');
        let flight_percentage = 0;
        if (fillEl && fillEl.style && fillEl.style.width) {
            const w = fillEl.style.width.trim();
            flight_percentage = Number(w.endsWith('%') ? w.slice(0, w.length - 1) : w) || 0;
        }

        // Calculate destination and departure country
        const country_wrapper = document.querySelector('div[class^="nodesAndProgress___"]');
        if (!country_wrapper) return;

        let countries = [...country_wrapper.querySelectorAll('img[class^="circularFlag___"]')];
        const fillHead = country_wrapper.querySelector('img[class^="fillHead___"]');

        // If fillHead has value of left, we are going back
        if (fillHead && fillHead.style.left) {
            countries = countries.reverse();
        }

        // Helper to extract clean name
        const extractName = (imgElement) => {
            // Get filename "flag_torn.png" or "fl_cayman_islands.png"
            let filename = imgElement.src.split('/').pop();

            // Remove extension
            let name = filename.split('.')[0];

            // Remove common prefixes
            name = name.replace(/^(flag_|32_|48_|fl_)/, '');

            // Force underscores to hyphens (normalizes DOM flag filenames to our keys)
            return name.replace(/_/g, '-');
        };

        if (countries.length < 2) return;
        const destination = extractName(countries[0]);
        const departure = extractName(countries[1]);

        const dest_loc = LOCATIONS[destination];
        const dep_loc = LOCATIONS[departure];

        // Calculate real coordinates
        const dep_real_x = canvas.width / 100 * dep_loc.x;
        const dep_real_y = canvas.height / 100 * dep_loc.y;
        const dest_real_x = canvas.width / 100 * dest_loc.x;
        const dest_real_y = canvas.height / 100 * dest_loc.y;

        // Compute curved path (quadratic Bezier) to mimic arc routes
        const control = computeControlPoint({ x: dep_real_x, y: dep_real_y }, { x: dest_real_x, y: dest_real_y });

        // Draw curved path with traveled portion in white
        const t = flight_percentage / 100;
        const invT = 1 - t;

        // Calculate point on Bezier curve at current progress
        const current_x = invT * invT * dep_real_x + 2 * invT * t * control.x + t * t * dest_real_x;
        const current_y = invT * invT * dep_real_y + 2 * invT * t * control.y + t * t * dest_real_y;

        // Calculate control point for traveled segment
        const traveled_control_x = invT * dep_real_x + t * control.x;
        const traveled_control_y = invT * dep_real_y + t * control.y;

        // Calculate control point for remaining segment
        const remaining_control_x = invT * control.x + t * dest_real_x;
        const remaining_control_y = invT * control.y + t * dest_real_y;

        ctx.lineWidth = 2;

        // Draw traveled path in teal with a small glow
        ctx.save();
        ctx.strokeStyle = '#20c997';
        ctx.shadowColor = 'rgba(32,201,151,0.45)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(dep_real_x, dep_real_y);
        ctx.quadraticCurveTo(traveled_control_x, traveled_control_y, current_x, current_y);
        ctx.stroke();
        ctx.restore();

        // Draw remaining path as mostly opaque white dotted line
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(current_x, current_y);
        ctx.quadraticCurveTo(remaining_control_x, remaining_control_y, dest_real_x, dest_real_y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Position plane along the curve (Bezier interpolation)
        const plane_x = current_x;
        const plane_y = current_y;
        // Rotation based on curve tangent
        const dx = 2 * invT * (control.x - dep_real_x) + 2 * t * (dest_real_x - control.x);
        const dy = 2 * invT * (control.y - dep_real_y) + 2 * t * (dest_real_y - control.y);
        const angle_rad = Math.atan2(dy, dx);
        const angle_deg = angle_rad * (180 / Math.PI);
        const final_rotation = angle_deg;

        // Update CSS transformation
        const plane = document.getElementById('plane-indicator');
        if (plane) {
            plane.style.left = `${plane_x - 10}px`;
            plane.style.top = `${plane_y - 10}px`;
            plane.style.transform = `rotate(${final_rotation}deg)`;
        }
    };

    const createLiveLocationMap = () => {
        const root = document.createElement('div');
        root.id = 'travel-location-map';

        // Use an actual responsive image for the map (keeps full width on mobile)
        root.style.height = 'auto';
        root.style.position = 'relative';

        // Map image (responsive)
        const mapImg = new Image();
        mapImg.src = MAP_BG_URL;
        mapImg.style.width = '100%';
        mapImg.style.height = 'auto';
        mapImg.style.display = 'block';
        mapImg.style.userSelect = 'none';
        mapImg.style.pointerEvents = 'none';

        // Draw the UI with the current flying location
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.zIndex = '0';
        canvas.style.pointerEvents = 'none';

        // Ensure the root height matches the image height so percentage sizing works
        const updateContainerSize = () => {
            if (mapImg && mapImg.getBoundingClientRect) {
                const r = mapImg.getBoundingClientRect();
                if (r.height > 0) root.style.height = `${r.height}px`;
            }
        };
        mapImg.addEventListener('load', () => {
            updateContainerSize();
        });
        window.addEventListener('resize', updateContainerSize);

        // Layer for flag markers
        const markerLayer = document.createElement('div');
        markerLayer.style.position = 'absolute';
        markerLayer.style.left = '0';
        markerLayer.style.top = '0';
        markerLayer.style.width = '100%';
        markerLayer.style.height = '100%';
        markerLayer.style.pointerEvents = 'none';
        markerLayer.style.zIndex = '3';

        // Vignette overlay
        const vignette = document.createElement('div');
        vignette.style.position = 'absolute';
        vignette.style.left = '0';
        vignette.style.top = '0';
        vignette.style.width = '100%';
        vignette.style.height = '100%';
        vignette.style.pointerEvents = 'none';
        vignette.style.zIndex = '2';
        vignette.style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)';

        // Indicator of where you are currently flying
        const map_location_indicator_plane = document.createElement('div');
        map_location_indicator_plane.style.width = '18px';
        map_location_indicator_plane.style.height = '18px';
        map_location_indicator_plane.style.position = 'absolute';
        map_location_indicator_plane.style.left = '0px';
        map_location_indicator_plane.style.top = '0px';
        map_location_indicator_plane.innerText = '✈︎';
        map_location_indicator_plane.style.color = '#FFF';
        map_location_indicator_plane.style.display = 'flex';
        map_location_indicator_plane.style.alignItems = 'center';
        map_location_indicator_plane.style.justifyContent = 'center';
        map_location_indicator_plane.style.fontSize = '16px';
        map_location_indicator_plane.style.textShadow = '-1px -1px 0 rgba(0,0,0,0.2), 1px -1px 0 rgba(0,0,0,0.2), -1px 1px 0 rgba(0,0,0,0.2), 1px 1px 0 rgba(0,0,0,0.2)';
        map_location_indicator_plane.style.filter = 'drop-shadow(0 0 4px rgba(255,255,255,0.6)) drop-shadow(0 0 8px rgba(255,80,80,0.4)) drop-shadow(0 0 14px rgba(255,100,100,0.2))';
        map_location_indicator_plane.style.animation = 'planeGlow 1.8s ease-in-out infinite alternate';
        map_location_indicator_plane.style.zIndex = '10';
        map_location_indicator_plane.id = 'plane-indicator';

        // Set transform-origin to center so rotation happens correctly
        map_location_indicator_plane.style.transformOrigin = 'center center';
        map_location_indicator_plane.style.transition = 'left 160ms linear, top 160ms linear, transform 140ms linear';

        // Start RAF loop after ensuring initial sizing
        const startLoop = () => {
            const loop = () => {
                renderFrame(canvas, ctx, markerLayer);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        };

        // Append elements: image first so it determines layout, then overlays
        root.appendChild(mapImg);
        root.appendChild(canvas);
        root.appendChild(markerLayer);
        root.appendChild(vignette);
        root.appendChild(map_location_indicator_plane);

        // Once image has loaded and container sized, start the loop
        mapImg.complete ? (updateContainerSize(), startLoop()) : mapImg.addEventListener('load', () => { updateContainerSize(); startLoop(); });

        return root;
    };

    const initialize = () => {
        const travel_root = document.getElementById('travel-root');
        const random_fact_box = travel_root.querySelector('div[class^="randomFactWrapper"]');
        const original_flight_animation = travel_root.querySelector("figure");

        if (!(random_fact_box && original_flight_animation)) {
            return false;
        }

        ensureStyles();
        const location_map = createLiveLocationMap();
        random_fact_box.remove();

        original_flight_animation.replaceWith(location_map);

        return true;
    };

    const attemptInitialization = () => {
        const result = initialize();

        if (!result) {
            requestAnimationFrame(attemptInitialization);
        }
    };

    requestAnimationFrame(attemptInitialization);
})();

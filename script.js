// --- CONSTANTES Y ELEMENTOS DEL DOM ---
const map = L.map('mapid').setView([-33.45694, -70.64827], 13); // Centrado en Santiago

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const codigoParadaInput = document.getElementById('codigoParada');
const buscarBtn = document.getElementById('buscarBtn');
const codigoRecorridoInput = document.getElementById('codigoRecorrido');
const buscarRecorridoBtn = document.getElementById('buscarRecorridoBtn');
const resultadosDiv = document.getElementById('resultados');
const loader = document.getElementById('loader');

// Capas para agrupar marcadores y polilíneas y poder limpiarlas fácilmente
const routeMarkersGroup = L.featureGroup().addTo(map);
let paradaMarker = null; // Para el marcador de la parada buscada (si existe)

// URLs de las APIs
// API 1: Para buscar próximas llegadas a una parada
const externalApiBaseUrl = 'https://red-api.chewy.workers.dev/stops';
// API 2: Para conocer el recorrido completo de una ruta
const recorridoApiBaseUrl = 'https://red.cl/restservice_v2/rest/conocerecorrido';

// --- GLOBAL VARIABLES FOR REAL-TIME SIMULATION ---
let currentBusMarker = null; // To hold the bus marker
let currentSimulationInterval = null; // To manage the interval for updates
let activeStopCode = null; // Store the stop code being tracked
let activeRouteId = null; // Store the route ID being tracked
let activeBusPlate = null; // Store the bus plate being tracked (for finding it in updates)


// --- FUNCIONES DE UTILIDAD ---

function limpiarUI() {
    // Limpiar marcadores y polilíneas anteriores
    if (paradaMarker) {
        map.removeLayer(paradaMarker);
        paradaMarker = null;
    }
    routeMarkersGroup.clearLayers();

    // Clear the bus simulation interval
    if (currentSimulationInterval) {
        clearInterval(currentSimulationInterval);
        currentSimulationInterval = null;
    }
    currentBusMarker = null;
    activeStopCode = null;
    activeRouteId = null;
    activeBusPlate = null;

    resultadosDiv.innerHTML = '';
    loader.style.display = 'none';
}


/**
 * Calcula una posición en una polilínea a una distancia específica, retrocediendo desde un punto objetivo.
 * Esta es una aproximación para fines de simulación visual.
 *
 * @param {Array<Array<number>>} polylineCoords - Un array de arrays [lat, lng] que representan los puntos de la polilínea.
 * @param {L.LatLng} targetLatLng - El objeto L.LatLng de la parada objetivo.
 * @param {number} distanceInMeters - La distancia en metros para retroceder desde el punto objetivo en la polilínea.
 * @returns {L.LatLng|null} Un objeto L.LatLng con la posición estimada del bus, o null si no se puede calcular.
 */
function getLatLngAtDistanceAlongPolyline(polylineCoords, targetLatLng, distanceInMeters) {
    const latlngs = polylineCoords.map(coord => L.latLng(coord[0], coord[1]));
    if (latlngs.length < 2) return null;

    let closestPointOnPolyline = null;
    let closestPointIndex = -1;
    let minDistanceToSegment = Infinity;

    for (let i = 0; i < latlngs.length - 1; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[i + 1];

        const distToP1 = targetLatLng.distanceTo(p1);
        if (distToP1 < minDistanceToSegment) {
            minDistanceToSegment = distToP1;
            closestPointOnPolyline = p1;
            closestPointIndex = i;
        }
        const distToP2 = targetLatLng.distanceTo(p2);
        if (distToP2 < minDistanceToSegment) {
            minDistanceToSegment = distToP2;
            closestPointOnPolyline = p2;
            closestPointIndex = i + 1;
        }
    }

    if (closestPointOnPolyline === null || closestPointIndex === -1) {
        console.warn("No se encontró un punto de referencia en la polilínea para la parada objetivo.");
        return null;
    }

    let currentDistanceCovered = 0;
    let lastPoint = latlngs[closestPointIndex];

    for (let i = closestPointIndex - 1; i >= 0; i--) {
        const nextPoint = latlngs[i];
        const segmentLength = lastPoint.distanceTo(nextPoint);

        if (currentDistanceCovered + segmentLength >= distanceInMeters) {
            const remainingDistanceInSegment = distanceInMeters - currentDistanceCovered;
            const ratio = remainingDistanceInSegment / segmentLength;

            const lat = lastPoint.lat + (nextPoint.lat - lastPoint.lat) * ratio;
            const lng = lastPoint.lng + (nextPoint.lng - lastPoint.lng) * ratio;
            return L.latLng(lat, lng);
        } else {
            currentDistanceCovered += segmentLength;
            lastPoint = nextPoint;
        }
    }

    return latlngs[0];
}


// Function to display a specific bus's route and initial "position"
async function showLiveBusAndRoute(originalStopCode, routeId, busPlate, initialBusDistance, initialArrivalEstimation) {
    limpiarUI();

    activeStopCode = originalStopCode;
    activeRouteId = routeId;
    activeBusPlate = busPlate;

    loader.style.display = 'block';
    resultadosDiv.innerHTML = `<p>Cargando recorrido y simulando bus ${busPlate} en ruta ${routeId}...</p>`;

    try {
        const fullApiUrl = `${recorridoApiBaseUrl}?codsint=${routeId}`;
        const response = await fetch(fullApiUrl);

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Error de la API al obtener recorrido: ${response.status} - ${errorData}`);
        }

        const apiResponseData = await response.json();
        const paraderos = apiResponseData.ida && apiResponseData.ida.paraderos ? apiResponseData.ida.paraderos : [];
        const pathCoordinates = apiResponseData.ida && apiResponseData.ida.path ? apiResponseData.ida.path : [];
        const routeColor = apiResponseData.negocio && apiResponseData.negocio.color ? apiResponseData.negocio.color : '#CF152D';

        let bounds = [];
        let targetStopLatLon = null;

        // Encontrar las coordenadas reales de la parada objetivo desde la lista de paraderos del recorrido
        if (activeStopCode) {
            const foundStopInParaderos = paraderos.find(p => p.cod === activeStopCode);
            if (foundStopInParaderos) {
                targetStopLatLon = L.latLng(foundStopInParaderos.pos[0], foundStopInParaderos.pos[1]);
                // Añadir un marcador especial para la parada objetivo
                L.marker(targetStopLatLon, {
                    icon: L.divIcon({
                        className: 'target-stop-icon',
                        html: `<div style="background-color: ${routeColor}; color: white; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white;">&#10003;</div>`,
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                }).addTo(routeMarkersGroup).bindPopup(`<strong>Paradero ${activeStopCode}</strong> (tu destino)`).openPopup();
                bounds.push(targetStopLatLon);
            } else {
                console.warn(`Paradero ${activeStopCode} no encontrado en los datos de recorrido para la ruta ${routeId}.`);
            }
        }

        // Dibujar la polilínea completa del recorrido
        if (pathCoordinates.length > 0) {
            const polyline = L.polyline(pathCoordinates, { color: routeColor, weight: 5, opacity: 0.7 }).addTo(map);
            routeMarkersGroup.addLayer(polyline);
            polyline.getLatLngs().forEach(latlng => bounds.push([latlng.lat, latlng.lng]));

            // --- SIMULACIÓN DE POSICIÓN INICIAL DEL BUS ---
            let busInitialPos = null;
            if (targetStopLatLon && initialBusDistance !== 'N/A' && parseFloat(initialBusDistance) >= 0) {
                busInitialPos = getLatLngAtDistanceAlongPolyline(pathCoordinates, targetStopLatLon, parseFloat(initialBusDistance));
            }

            if (!busInitialPos) {
                busInitialPos = L.latLng(pathCoordinates[0][0], pathCoordinates[0][1]);
                console.warn("No se pudo calcular la posición inicial del bus basada en la distancia, colocándolo al inicio de la ruta.");
            }

            // --- ESTA ES LA SECCIÓN CLAVE: USA TU ÍCONO PERSONALIZADO ---
            currentBusMarker = L.marker(busInitialPos, {
                icon: L.divIcon({
                    className: 'custom-bus-icon', // Clase de CSS para el ícono del bus
                    html: `
                        <div class="bus-image"></div>
                        <span class="route-text">${routeId}</span> 
                    `,
                    iconSize: [45, 25], // Tamaño del ícono (ancho, alto)
                    iconAnchor: [22, 12] // Punto de anclaje (generalmente la mitad del tamaño)
                })
            }).addTo(routeMarkersGroup);

            currentBusMarker.bindPopup(`
                <strong>Bus: ${busPlate} (Ruta: ${routeId})</strong><br>
                Llega en: <span style="font-weight: bold; color: #CF152D;">${initialArrivalEstimation}</span><br>
                Distancia: ${initialBusDistance} mts
            `).openPopup();

        } else {
            resultadosDiv.innerHTML = `<p class="error-msg">No se encontraron datos de recorrido para la ruta ${routeId}.</p>`;
        }

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            if (currentBusMarker) map.setView(currentBusMarker.getLatLng(), 15);
        }

        resultadosDiv.innerHTML = `<p class="info-msg">Mostrando ruta de <strong>${routeId}</strong>. Actualizaciones para bus <strong>${busPlate}</strong> cada 15 segundos.</p>`;

        if (currentSimulationInterval) clearInterval(currentSimulationInterval);
        currentSimulationInterval = setInterval(updateBusPosition, 15000);

    } catch (error) {
        console.error('Error al mostrar recorrido y simular bus:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error al cargar el recorrido o simular el bus: ${error.message}.</p>`;
    } finally {
        loader.style.display = 'none';
    }
}

// --- updateBusPosition (modificada para mover el bus) ---
async function updateBusPosition() {
    if (!activeStopCode || !activeRouteId || !activeBusPlate) {
        console.warn("No hay un bus siendo rastreado activamente para actualizaciones.");
        return;
    }

    console.log(`[DEBUG] Actualizando posición para bus ${activeBusPlate} en ruta ${activeRouteId} para parada ${activeStopCode}`);

    try {
        // 1. Re-obtener las próximas llegadas para la parada activa
        const fullApiUrl = `${externalApiBaseUrl}/${activeStopCode}/next_arrivals`;
        const response = await fetch(fullApiUrl);
        if (!response.ok) {
            throw new Error(`Error al re-obtener llegadas para ${activeStopCode}: ${response.status}`);
        }
        const apiResponseData = await response.json();
        const services = apiResponseData.results;

        let foundBus = null;
        if (services && Array.isArray(services)) {
            foundBus = services.find(s => s.route_id === activeRouteId && s.bus_plate_number === activeBusPlate);
        }

        if (foundBus) {
            const tiempoEstimado = foundBus.arrival_estimation;
            const distanciaMetros = foundBus.bus_distance;

            // 2. Re-obtener los datos del recorrido completo (polilínea y paraderos)
            const recorridoResponse = await fetch(`${recorridoApiBaseUrl}?codsint=${activeRouteId}`);
            if (!recorridoResponse.ok) throw new Error("No se pudo re-obtener la ruta para la actualización de la posición del bus.");
            const recorridoData = await recorridoResponse.json();
            const pathCoordinates = recorridoData.ida && recorridoData.ida.path ? recorridoData.ida.path : [];
            const paraderos = recorridoData.ida && recorridoData.ida.paraderos ? recorridoData.ida.paraderos : [];

            let newBusPos = null;
            let targetStopLatLon = null;

            const foundStopInParaderos = paraderos.find(p => p.cod === activeStopCode);
            if (foundStopInParaderos) {
                targetStopLatLon = L.latLng(foundStopInParaderos.pos[0], foundStopInParaderos.pos[1]);
            }

            // 3. Si tenemos todos los datos, calcular la nueva posición del bus y mover el marcador
            if (currentBusMarker && targetStopLatLon && pathCoordinates.length > 1 && distanciaMetros !== 'N/A' && parseFloat(distanciaMetros) >= 0) {
                newBusPos = getLatLngAtDistanceAlongPolyline(pathCoordinates, targetStopLatLon, parseFloat(distanciaMetros));
                if (newBusPos) {
                    currentBusMarker.setLatLng(newBusPos); // Actualizar la posición del marcador en el mapa
                }
            }

            // 4. Actualizar el contenido del popup del marcador del bus
            if (currentBusMarker) {
                currentBusMarker.setPopupContent(`
                    <strong>Bus: ${activeBusPlate} (Ruta: ${activeRouteId})</strong><br>
                    Llega en: <span style="font-weight: bold; color: #CF152D;">${tiempoEstimado}</span><br>
                    Distancia: ${distanciaMetros} mts
                `).openPopup();
            }
        } else {
            console.warn(`Bus ${activeBusPlate} (Ruta ${activeRouteId}) ya no se encontró en la lista de próximas llegadas para ${activeStopCode}.`);
            // Opcional: Podrías detener la simulación o remover el marcador si el bus desaparece
            // clearInterval(currentSimulationInterval);
            // if (currentBusMarker) {
            //      map.removeLayer(currentBusMarker);
            //      currentBusMarker = null;
            // }
        }

    } catch (error) {
        console.error("Error al actualizar la posición del bus:", error);
    }
}

// --- EVENT LISTENERS ---

buscarBtn.addEventListener('click', async () => {
    const codigoParada = codigoParadaInput.value.trim().toUpperCase();
    if (!codigoParada) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un código de parada (ej. PF1126).</p>';
        limpiarUI();
        return;
    }

    limpiarUI();
    resultadosDiv.innerHTML = '<p>Cargando información del paradero...</p>';
    loader.style.display = 'block';

    try {
        const fullApiUrl = `${externalApiBaseUrl}/${codigoParada}/next_arrivals`;
        const response = await fetch(fullApiUrl);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error de la API externa para paradas: ${response.status} - ${errorText}`);
        }

        const apiResponseData = await response.json();
        const services = apiResponseData.results;

        let htmlResultados = `<h2>Resultados para el Paradero: ${codigoParada}</h2>`;

        if (services && Array.isArray(services) && services.length > 0) {
            htmlResultados += '<h3>Próximas llegadas (Haz clic para ver recorrido y bus):</h3><ul>';
            services.forEach(servicio => {
                const tiempoEstimado = servicio.arrival_estimation || 'N/A';
                const distanciaMetros = servicio.bus_distance !== undefined ? servicio.bus_distance : 'N/A';
                const rutaId = servicio.route_id || 'undefined';
                const patente = servicio.bus_plate_number || 'N/A';

                htmlResultados += `<li class="clickable-bus-route"
                                        data-stop-code="${codigoParada}"
                                        data-route-id="${rutaId}"
                                        data-bus-plate="${patente}"
                                        data-bus-distance="${distanciaMetros}"
                                        data-arrival-estimation="${tiempoEstimado}">
                                        <strong>Ruta: ${rutaId}</strong> (Patente: ${patente}):
                                        <span>${tiempoEstimado} <span class="distance">(aprox. ${distanciaMetros} mts)</span></span>
                                        </li>`;
            });
            htmlResultados += '</ul>';

        } else {
            htmlResultados += '<p class="info-msg">No hay buses cercanos para este paradero en este momento.</p>';
        }
        resultadosDiv.innerHTML = htmlResultados;

    } catch (error) {
        console.error('Error al buscar paradero:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error al buscar el paradero: ${error.message}. Verifica la consola del navegador para más detalles.</p>`;
    } finally {
        loader.style.display = 'none';
    }
});


// Event delegation for clicking on bus routes in the results panel
resultadosDiv.addEventListener('click', (event) => {
    const clickedListItem = event.target.closest('.clickable-bus-route');
    if (clickedListItem) {
        const stopCode = clickedListItem.dataset.stopCode;
        const routeId = clickedListItem.dataset.routeId;
        const busPlate = clickedListItem.dataset.busPlate;
        const busDistance = clickedListItem.dataset.busDistance;
        const arrivalEstimation = clickedListItem.dataset.arrivalEstimation;

        if (stopCode && routeId && busPlate) {
            showLiveBusAndRoute(stopCode, routeId, busPlate, busDistance, arrivalEstimation);
        }
    }
});

buscarRecorridoBtn.addEventListener('click', async () => {
    const codigoRecorrido = codigoRecorridoInput.value.trim().toUpperCase();
    if (!codigoRecorrido) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un código de recorrido (ej. F03).</p>';
        limpiarUI();
        return;
    }

    limpiarUI();
    resultadosDiv.innerHTML = '<p>Cargando información del recorrido y paraderos...</p>';
    loader.style.display = 'block';

    try {
        const fullApiUrl = `${recorridoApiBaseUrl}?codsint=${codigoRecorrido}`;
        const response = await fetch(fullApiUrl);

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Error de la API externa para recorrido: ${response.status} - ${errorData}`);
        }

        const apiResponseData = await response.json();
        const paraderos = apiResponseData.ida && apiResponseData.ida.paraderos ? apiResponseData.ida.paraderos : [];
        const pathCoordinates = apiResponseData.ida && apiResponseData.ida.path ? apiResponseData.ida.path : [];
        const routeColor = apiResponseData.negocio && apiResponseData.negocio.color ? apiResponseData.negocio.color : '#CF152D';

        if (paraderos.length === 0 && pathCoordinates.length === 0) {
            resultadosDiv.innerHTML = '<p class="error-msg">No se encontraron paraderos ni datos de recorrido para esta ruta.</p>';
            return;
        }

        let htmlResultados = `<h2>Paraderos para el Recorrido: ${codigoRecorrido}</h2><h3>${apiResponseData.negocio.nombre || 'Nombre no disponible'}</h3><ul>`;
        let bounds = [];

        paraderos.forEach(paradero => {
            const lat = paradero.pos[0];
            const lng = paradero.pos[1];
            const paradaNombre = paradero.name || 'Nombre no disponible';
            const paradaCodigo = paradero.cod || 'N/A';

            const marker = L.marker([lat, lng]).bindPopup(`<strong>${paradaCodigo}</strong><br>${paradaNombre}`);
            routeMarkersGroup.addLayer(marker);
            bounds.push([lat, lng]);
            htmlResultados += `<li><strong>${paradaCodigo}</strong>: ${paradaNombre}</li>`;
        });
        htmlResultados += '</ul>';
        resultadosDiv.innerHTML = htmlResultados;

        if (pathCoordinates.length > 0) {
            const polyline = L.polyline(pathCoordinates, { color: routeColor, weight: 5, opacity: 0.7 }).addTo(map);
            routeMarkersGroup.addLayer(polyline);
            polyline.getLatLngs().forEach(latlng => bounds.push([latlng.lat, latlng.lng]));
        }

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }

    } catch (error) {
        console.error('Error al buscar recorrido:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error al buscar el recorrido: ${error.message}. Verifica la consola del navegador para más detalles.</p>`;
    } finally {
        loader.style.display = 'none';
    }
});

// Initialize with a clean UI message
resultadosDiv.innerHTML = '<p class="info-msg">Ingresa un código de parada o de recorrido para ver la información.</p>';
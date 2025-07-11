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
let currentBusMarker = null; // To hold the bus emoji marker
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


// --- New function to update the bus marker's position and info ---
async function updateBusPosition() {
    if (!activeStopCode || !activeRouteId || !activeBusPlate) {
        console.warn("No bus is actively being tracked for updates.");
        return;
    }

    console.log(`[DEBUG] Actualizando posición para bus ${activeBusPlate} en ruta ${activeRouteId} para parada ${activeStopCode}`);

    try {
        const fullApiUrl = `${externalApiBaseUrl}/${activeStopCode}/next_arrivals`;
        const response = await fetch(fullApiUrl);
        if (!response.ok) {
            throw new Error(`Error al re-fetch de llegadas para ${activeStopCode}: ${response.status}`);
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

            if (currentBusMarker) {
                currentBusMarker.setPopupContent(`
                    <strong>Bus: ${activeBusPlate} (Ruta: ${activeRouteId})</strong><br>
                    Llega en: <span style="font-weight: bold; color: #CF152D;">${tiempoEstimado}</span><br>
                    Distancia: ${distanciaMetros} mts
                `).openPopup();
            }
        } else {
            console.warn(`Bus ${activeBusPlate} (Ruta ${activeRouteId}) ya no se encontró en la lista de próximas llegadas para ${activeStopCode}.`);
        }

    } catch (error) {
        console.error("Error al actualizar la posición del bus:", error);
    }
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
        if (activeStopCode) {
            const foundStop = paraderos.find(p => p.cod === activeStopCode);
            if (foundStop) {
                targetStopLatLon = L.latLng(foundStop.pos[0], foundStop.pos[1]);
                L.marker(targetStopLatLon, {
                    icon: L.divIcon({
                        className: 'target-stop-icon',
                        html: `<div style="background-color: ${routeColor}; color: white; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white;">&#10003;</div>`,
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                }).addTo(routeMarkersGroup).bindPopup(`<strong>Paradero ${activeStopCode}</strong> (tu destino)`).openPopup();
                bounds.push(targetStopLatLon);
            }
        }


        if (pathCoordinates.length > 0) {
            const polyline = L.polyline(pathCoordinates, { color: routeColor, weight: 5, opacity: 0.7 }).addTo(map);
            routeMarkersGroup.addLayer(polyline);
            polyline.getLatLngs().forEach(latlng => bounds.push([latlng.lat, latlng.lng]));

            const busInitialPos = L.latLng(pathCoordinates[0][0], pathCoordinates[0][1]);

            currentBusMarker = L.marker(busInitialPos, {
                icon: L.divIcon({
                    className: 'bus-emoji-icon',
                    html: `<div style="font-size: 25px;">🚌</div>`,
                    iconSize: [25, 25],
                    iconAnchor: [12, 12]
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

// Original buscarRecorridoBtn.addEventListener (ensure it calls limpiarUI to clear intervals)
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
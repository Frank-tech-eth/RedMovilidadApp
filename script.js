const codigoParadaInput = document.getElementById('codigoParadaInput');
const buscarBtn = document.getElementById('buscarBtn');
const resultadosDiv = document.getElementById('resultados');

// NUEVAS CONSTANTES para el recorrido
const codigoRecorridoInput = document.getElementById('codigoRecorridoInput');
const buscarRecorridoBtn = document.getElementById('buscarRecorridoBtn');


const externalApiBaseUrl = 'https://red-api.chewy.workers.dev/stops';
const recorridoApiBaseUrl = 'https://red.cl/restservice_v2/rest/conocerecorrido'; // Nueva API

let map = L.map('map').setView([-33.4489, -70.6693], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let paradaMarker = null; // Para el marcador de parada individual
let routeMarkersGroup = L.featureGroup().addTo(map); // Grupo para marcadores de recorrido y polilínea

function limpiarUI() {
    // Limpia el marcador de parada individual
    if (paradaMarker) {
        map.removeLayer(paradaMarker);
        paradaMarker = null;
    }
    // Limpia todos los marcadores y polilíneas del recorrido
    routeMarkersGroup.clearLayers();
    resultadosDiv.innerHTML = '';
}

// Lógica para buscar paradas individuales (EXISTENTE)
buscarBtn.addEventListener('click', async () => {
    const codigoParada = codigoParadaInput.value.trim().toUpperCase();
    console.log(`[DEBUG] Código de parada ingresado: "${codigoParada}"`);

    if (!codigoParada) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un código de parada (ej. PF1126).</p>';
        limpiarUI();
        return;
    }

    resultadosDiv.innerHTML = '<p>Cargando información del paradero...</p>';
    limpiarUI(); // Limpia la UI antes de una nueva búsqueda

    try {
        const fullApiUrl = `${externalApiBaseUrl}/${codigoParada}/next_arrivals`;
        console.log(`[DEBUG] Llamando a la URL de la API: "${fullApiUrl}"`);

        const response = await fetch(fullApiUrl);

        console.log(`[DEBUG] Respuesta de la API - Status: ${response.status} (${response.statusText})`);

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[DEBUG] Error detallado de la API: ${errorData}`);
            throw new Error(`Error de la API externa: ${response.status} - ${errorData}`);
        }

        const apiResponseData = await response.json();
        console.log("[DEBUG] Datos de la API recibidos (objeto JavaScript):", apiResponseData);

        const services = apiResponseData.results;

        if (!services || !Array.isArray(services)) {
            resultadosDiv.innerHTML = '<p class="error-msg">Formato de datos inesperado de la API. No se pudo obtener la información de servicios.</p>';
            return;
        }

        let htmlResultados = `<h2>Resultados para el Paradero: ${codigoParada}</h2>`;

        if (services.length > 0) {
            htmlResultados += '<h3>Próximas llegadas:</h3><ul>';
            services.forEach(servicio => {
                const tiempoEstimado = servicio.arrival_estimation;
                const distanciaMetros = servicio.bus_distance;
                const rutaId = servicio.route_id;
                const patente = servicio.bus_plate_number || 'N/A';

                htmlResultados += `<li>
                                    <strong>Ruta: ${rutaId}</strong> (Patente: ${patente}): 
                                    <span>${tiempoEstimado} <span class="distance">(aprox. ${distanciaMetros} mts)</span></span>
                                   </li>`;
            });
            htmlResultados += '</ul>';
        } else {
            htmlResultados += '<p>No hay buses cercanos para este paradero en este momento.</p>';
        }
        resultadosDiv.innerHTML = htmlResultados;

        console.warn("[DEBUG] La API de llegadas no proporciona coordenadas de latitud/longitud del paradero. El mapa no se centrará automáticamente.");

    } catch (error) {
        console.error('Error en la aplicación:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error: ${error.message}. Verifica la consola del navegador para más detalles.</p>`;
    }
});

// NUEVA Lógica para buscar recorridos y dibujar en el mapa
buscarRecorridoBtn.addEventListener('click', async () => {
    const codigoRecorrido = codigoRecorridoInput.value.trim().toUpperCase();
    console.log(`[DEBUG] Código de recorrido ingresado: "${codigoRecorrido}"`);

    if (!codigoRecorrido) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un código de recorrido (ej. F03).</p>';
        limpiarUI();
        return;
    }

    resultadosDiv.innerHTML = '<p>Cargando información del recorrido y paraderos...</p>';
    limpiarUI(); // Limpia la UI antes de una nueva búsqueda

    try {
        const fullApiUrl = `${recorridoApiBaseUrl}?codsint=${codigoRecorrido}`;
        console.log(`[DEBUG] Llamando a la API de recorrido: "${fullApiUrl}"`);

        // NOTA: Si experimentas problemas de CORS, es posible que necesites un proxy.
        // Por ejemplo: `const response = await fetch('https://cors-anywhere.herokuapp.com/' + fullApiUrl);`
        const response = await fetch(fullApiUrl);

        console.log(`[DEBUG] Respuesta de la API de recorrido - Status: ${response.status} (${response.statusText})`);

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[DEBUG] Error detallado de la API de recorrido: ${errorData}`);
            throw new Error(`Error de la API externa para recorrido: ${response.status} - ${errorData}`);
        }

        const apiResponseData = await response.json();
        console.log("[DEBUG] Datos de la API de recorrido recibidos:", apiResponseData);

        // Accedemos a los paraderos y al path desde la sección 'ida' (ida del recorrido)
        const paraderos = apiResponseData.ida.paraderos;
        const pathCoordinates = apiResponseData.ida.path;
        const routeColor = apiResponseData.negocio.color || '#004A8F'; // Color del negocio o azul por defecto

        if (!paraderos || !Array.isArray(paraderos) || paraderos.length === 0) {
            resultadosDiv.innerHTML = '<p class="error-msg">No se encontraron paraderos para este recorrido o el formato de datos es inesperado.</p>';
            return;
        }

        let htmlResultados = `<h2>Paraderos para el Recorrido: ${codigoRecorrido}</h2><h3>${apiResponseData.negocio.nombre}</h3><ul>`;
        let bounds = []; // Para ajustar el zoom del mapa a todos los marcadores

        // Dibuja los paraderos en el mapa
        paraderos.forEach(paradero => {
            const lat = paradero.pos[0];
            const lng = paradero.pos[1];
            const paradaNombre = paradero.name;
            const paradaCodigo = paradero.cod;

            // Crea un marcador y lo añade al grupo
            const marker = L.marker([lat, lng]).bindPopup(`<strong>${paradaCodigo}</strong><br>${paradaNombre}`);
            routeMarkersGroup.addLayer(marker);

            bounds.push([lat, lng]); // Añade las coordenadas para calcular los límites del mapa

            htmlResultados += `<li><strong>${paradaCodigo}</strong>: ${paradaNombre}</li>`;
        });
        htmlResultados += '</ul>';
        resultadosDiv.innerHTML = htmlResultados;

        // Dibuja el trazo del recorrido (polyline)
        if (pathCoordinates && Array.isArray(pathCoordinates) && pathCoordinates.length > 0) {
            // El formato de path es [lat, lng], que es lo que L.polyline espera.
            const polyline = L.polyline(pathCoordinates, { color: routeColor, weight: 5, opacity: 0.7 }).addTo(map);
            routeMarkersGroup.addLayer(polyline); // Añade la polilínea al mismo grupo para limpieza fácil

            // Extiende los límites para incluir también la polilínea
            polyline.getLatLngs().forEach(latlng => bounds.push([latlng.lat, latlng.lng]));
        }

        // Ajusta el mapa para que se vean todos los marcadores y el recorrido
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] }); // Añade un padding para que no quede justo al borde
        }

    } catch (error) {
        console.error('Error al buscar recorrido:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error al buscar el recorrido: ${error.message}. Verifica la consola del navegador para más detalles.</p>`;
    }
});
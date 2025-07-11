// --- CONSTANTES Y ELEMENTOS DEL DOM ---
const codigoParadaInput = document.getElementById('codigoParadaInput');
const buscarBtn = document.getElementById('buscarBtn');
const resultadosDiv = document.getElementById('resultados');
const codigoRecorridoInput = document.getElementById('codigoRecorridoInput');
const buscarRecorridoBtn = document.getElementById('buscarRecorridoBtn');
const loader = document.getElementById('loader');

// --- URLs de las APIs (Ambas corregidas y presentes) ---
// API para buscar pr�ximas llegadas en una parada (proxy para evitar CORS)
const externalApiBaseUrl = 'https://red-api.chewy.workers.dev/stops';
// API para conocer el recorrido completo de una ruta y sus paraderos
const recorridoApiBaseUrl = 'https://red.cl/restservice_v2/rest/conocerecorrido';


// --- CONFIGURACI�N DEL MAPA LEAFLET ---
let map = L.map('map').setView([-33.4489, -70.6693], 12); // Centro inicial en Santiago

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let paradaMarker = null; // Para el marcador de parada individual
// Grupo para manejar f�cilmente los marcadores y polil�neas del recorrido
let routeMarkersGroup = L.featureGroup().addTo(map);


// --- FUNCIONES DE UTILIDAD ---

// Funci�n para limpiar la interfaz de usuario (resultados, marcadores, loader)
function limpiarUI() {
    // Limpia el marcador de parada individual si existe
    if (paradaMarker) {
        map.removeLayer(paradaMarker);
        paradaMarker = null;
    }
    // Limpia todos los marcadores y polil�neas del grupo de recorrido
    routeMarkersGroup.clearLayers();
    resultadosDiv.innerHTML = ''; // Limpia el panel de resultados
    loader.style.display = 'none'; // Oculta el loader
}

// --- EVENT LISTENERS (L�GICA DE B�SQUEDA) ---

// Event listener para el bot�n de buscar paradas individuales
buscarBtn.addEventListener('click', async () => {
    const codigoParada = codigoParadaInput.value.trim().toUpperCase();
    console.log(`[DEBUG] C�digo de parada ingresado: "${codigoParada}"`);

    if (!codigoParada) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un c�digo de parada (ej. PF1126).</p>';
        limpiarUI(); // Limpia la UI y oculta el loader
        return;
    }

    resultadosDiv.innerHTML = '<p>Cargando informaci�n del paradero...</p>';
    loader.style.display = 'block'; // Muestra el loader de carga

    try {
        // Construye la URL para la API de paradas individuales
        const fullApiUrl = `${externalApiBaseUrl}/${codigoParada}/next_arrivals`;
        console.log(`[DEBUG] Llamando a la URL de la API de paradas: "${fullApiUrl}"`);

        const response = await fetch(fullApiUrl);

        console.log(`[DEBUG] Respuesta de la API de paradas - Status: ${response.status} (${response.statusText})`);

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[DEBUG] Error detallado de la API de paradas: ${errorData}`);
            throw new Error(`Error de la API externa para paradas: ${response.status} - ${errorData}`);
        }

        const apiResponseData = await response.json();
        console.log("[DEBUG] Datos de la API de paradas recibidos:", apiResponseData);

        const services = apiResponseData.results;

        if (!services || !Array.isArray(services)) {
            resultadosDiv.innerHTML = '<p class="error-msg">Formato de datos inesperado de la API. No se pudo obtener la informaci�n de servicios.</p>';
            return;
        }

        let htmlResultados = `<h2>Resultados para el Paradero: ${codigoParada}</h2>`;

        if (services.length > 0) {
            htmlResultados += '<h3>Pr�ximas llegadas:</h3><ul>';
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
            htmlResultados += '<p class="info-msg">No hay buses cercanos para este paradero en este momento.</p>';
        }
        resultadosDiv.innerHTML = htmlResultados;

        console.warn("[DEBUG] La API de llegadas no proporciona coordenadas de latitud/longitud del paradero. El mapa no se centrar� autom�ticamente en la parada.");

    } catch (error) {
        console.error('Error al buscar paradero:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurri� un error al buscar el paradero: ${error.message}. Verifica la consola del navegador para m�s detalles.</p>`;
    } finally {
        loader.style.display = 'none'; // Oculta el loader al finalizar (�xito o error)
    }
});

// Event listener para el bot�n de buscar recorridos
buscarRecorridoBtn.addEventListener('click', async () => {
    const codigoRecorrido = codigoRecorridoInput.value.trim().toUpperCase();
    console.log(`[DEBUG] C�digo de recorrido ingresado: "${codigoRecorrido}"`);

    if (!codigoRecorrido) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un c�digo de recorrido (ej. F03).</p>';
        limpiarUI(); // Limpia la UI y oculta el loader
        return;
    }

    resultadosDiv.innerHTML = '<p>Cargando informaci�n del recorrido y paraderos...</p>';
    loader.style.display = 'block'; // Muestra el loader de carga

    try {
        // Construye la URL para la API de recorridos
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

        // Accedemos a los paraderos y al path desde la secci�n 'ida' (ida del recorrido)
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

            // Crea un marcador y lo a�ade al grupo de marcadores del recorrido
            const marker = L.marker([lat, lng]).bindPopup(`<strong>${paradaCodigo}</strong><br>${paradaNombre}`);
            routeMarkersGroup.addLayer(marker);

            bounds.push([lat, lng]); // A�ade las coordenadas para calcular los l�mites del mapa
            htmlResultados += `<li><strong>${paradaCodigo}</strong>: ${paradaNombre}</li>`;
        });
        htmlResultados += '</ul>';
        resultadosDiv.innerHTML = htmlResultados;

        // Dibuja el trazo del recorrido (polyline)
        if (pathCoordinates && Array.isArray(pathCoordinates) && pathCoordinates.length > 0) {
            // El formato de path es [lat, lng], que es lo que L.polyline espera.
            const polyline = L.polyline(pathCoordinates, { color: routeColor, weight: 5, opacity: 0.7 }).addTo(map);
            routeMarkersGroup.addLayer(polyline); // A�ade la polil�nea al mismo grupo para limpieza f�cil

            // Extiende los l�mites para incluir tambi�n la polil�nea (si no est� ya cubierta por los paraderos)
            polyline.getLatLngs().forEach(latlng => bounds.push([latlng.lat, latlng.lng]));
        }

        // Ajusta el mapa para que se vean todos los marcadores y el recorrido
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] }); // A�ade un padding para que no quede justo al borde
        }

    } catch (error) {
        console.error('Error al buscar recorrido:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurri� un error al buscar el recorrido: ${error.message}. Verifica la consola del navegador para m�s detalles.</p>`;
    } finally {
        loader.style.display = 'none'; // Oculta el loader al finalizar (�xito o error)
    }
});
const codigoParadaInput = document.getElementById('codigoParadaInput');
const buscarBtn = document.getElementById('buscarBtn');
const resultadosDiv = document.getElementById('resultados');

const externalApiBaseUrl = 'https://red-api.chewy.workers.dev/stops';

let map = L.map('map').setView([-33.4489, -70.6693], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let paradaMarker = null;

function limpiarUI() {
    if (paradaMarker) {
        map.removeLayer(paradaMarker);
        paradaMarker = null;
    }
    resultadosDiv.innerHTML = '';
}

buscarBtn.addEventListener('click', async () => {
    const codigoParada = codigoParadaInput.value.trim().toUpperCase();
    console.log(`[DEBUG] Código de parada ingresado: "${codigoParada}"`);

    if (!codigoParada) {
        resultadosDiv.innerHTML = '<p class="error-msg">Por favor, ingresa un código de parada (ej. PF1126).</p>';
        limpiarUI();
        return;
    }

    resultadosDiv.innerHTML = '<p>Cargando información del paradero...</p>';
    limpiarUI();

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
                // --- CAMBIOS AQUÍ ---
                // 1. Obtener la estimación como string directamente
                const tiempoEstimado = servicio.arrival_estimation;
                // 2. Usar bus_distance
                const distanciaMetros = servicio.bus_distance;
                // 3. Usar route_id
                const rutaId = servicio.route_id;
                // 4. Usar bus_plate_number
                const patente = servicio.bus_plate_number || 'N/A';

                htmlResultados += `<li>
                                    <strong>Ruta: ${rutaId}</strong> (Patente: ${patente}): 
                                    **${tiempoEstimado}** (aprox. ${distanciaMetros} mts)
                                   </li>`;
            });
            htmlResultados += '</ul>';
        } else {
            htmlResultados += '<p>No hay buses cercanos para este paradero en este momento.</p>';
        }
        resultadosDiv.innerHTML = htmlResultados;

        console.warn("[DEBUG] La API actual no proporciona coordenadas de latitud/longitud del paradero. El mapa no se centrará automáticamente.");

    } catch (error) {
        console.error('Error en la aplicación:', error);
        resultadosDiv.innerHTML = `<p class="error-msg">Ocurrió un error: ${error.message}. Verifica la consola del navegador para más detalles.</p>`;
    }
});
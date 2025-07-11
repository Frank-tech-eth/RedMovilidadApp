using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using System.Collections.Generic; // Para List
using RedMovilidad.Api.Models; // ¡Importante! Para poder usar tus modelos de datos

namespace RedMovilidad.Api.Controllers // ¡Asegúrate de que el namespace sea correcto!
{
    [ApiController] // Indica que esta clase es un controlador de API
    [Route("api/[controller]")] // Define la ruta base para este controlador (ej. /api/buses)
    public class BusesController : ControllerBase // Hereda de ControllerBase para funcionalidad de API
    {
        private readonly IHttpClientFactory _httpClientFactory;

        // Constructor: ASP.NET Core "inyecta" (proporciona) una instancia de IHttpClientFactory
        public BusesController(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory;
        }

        // Endpoint HTTP GET: Se accede a través de /api/buses/parada/{codigoParada}
        [HttpGet("parada/{codigoParada}")]
        public async Task<IActionResult> GetLlegadasParada(string codigoParada)
        {
            // Crea un cliente HTTP usando la configuración que hicimos en Program.cs
            var client = _httpClientFactory.CreateClient("RedMovilidadClient");

            // Construimos la URL completa para la API externa de chewy.workers.dev
            // La BaseAddress ya es "https://red-api.chewy.workers.dev/", solo añadimos el resto
            string requestUrl = $"stops/{codigoParada}/next_arrivals";

            // Realiza la solicitud HTTP GET a la API externa
            var response = await client.GetAsync(requestUrl);

            // Verifica si la solicitud fue exitosa (código de estado 200 OK)
            if (response.IsSuccessStatusCode)
            {
                // Lee el contenido de la respuesta como una cadena de texto (JSON)
                var jsonResponse = await response.Content.ReadAsStringAsync();

                // Deserializa el JSON a tu objeto C# usando el modelo que creaste
                var paradaLlegadas = JsonSerializer.Deserialize<ParaderoLlegadasResponse>(
                    jsonResponse,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true } // Importante para mapear JSON (camelCase) a C# (PascalCase)
                );

                // Devuelve el objeto C# (que ASP.NET Core convertirá automáticamente a JSON para el frontend)
                return Ok(paradaLlegadas);
            }
            else
            {
                // Si hubo un error en la llamada a la API externa, obtenemos el mensaje de error
                var errorContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"Error al consultar API externa para parada {codigoParada}: {response.StatusCode} - {errorContent}");
                // Devolvemos un código de estado de error al frontend con un mensaje descriptivo
                return StatusCode((int)response.StatusCode, $"Error al obtener datos para la parada {codigoParada}. Por favor, verifica el código e intenta de nuevo. Detalles: {response.ReasonPhrase}.");
            }
        }
    }
}
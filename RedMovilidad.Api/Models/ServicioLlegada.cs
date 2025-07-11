using System.Text.Json.Serialization; // Necesario para [JsonPropertyName]

namespace RedMovilidad.Api.Models // ¡Asegúrate de que el namespace sea correcto para tu proyecto!
{
    public class ServicioLlegada
    {
        [JsonPropertyName("route")]
        public string Route { get; set; }

        [JsonPropertyName("plate")]
        public string Plate { get; set; }

        [JsonPropertyName("distance")]
        public int Distance { get; set; }

        [JsonPropertyName("time_to_arrival")]
        public int TimeToArrival { get; set; }
    }
}
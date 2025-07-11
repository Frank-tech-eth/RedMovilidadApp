using System.Text.Json.Serialization;
using System.Collections.Generic;

namespace RedMovilidad.Api.Models // ¡Asegúrate de que el namespace sea correcto para tu proyecto!
{
    public class ParaderoLlegadasResponse
    {
        [JsonPropertyName("stop_code")]
        public string StopCode { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("latitude")]
        public double Latitude { get; set; }

        [JsonPropertyName("longitude")]
        public double Longitude { get; set; }

        [JsonPropertyName("services")]
        public List<ServicioLlegada> Services { get; set; } = new List<ServicioLlegada>();
    }
}
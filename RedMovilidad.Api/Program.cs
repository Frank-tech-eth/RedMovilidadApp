using System.Net.Http;
using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// --- INICIO: Configuraci�n de Servicios ---

// Habilita el soporte para controladores (tu BusesController)
builder.Services.AddControllers();

// Configurar HttpClient para llamar a la API externa de RED Movilidad
builder.Services.AddHttpClient("RedMovilidadClient", client =>
{
    // Esta es la URL base de la API de chewy.workers.dev
    client.BaseAddress = new Uri("https://red-api.chewy.workers.dev/");
    client.Timeout = TimeSpan.FromSeconds(10); // Tiempo m�ximo de espera para la respuesta
    client.DefaultRequestHeaders.Add("Accept", "application/json"); // Indicamos que esperamos JSON
});

// Configurar CORS (Cross-Origin Resource Sharing)
// Esto es VITAL para que tu frontend de JavaScript pueda hacer llamadas a tu backend de C#.
var MyAllowSpecificOrigins = "_myAllowSpecificOrigins";
builder.Services.AddCors(options =>
{
    options.AddPolicy(name: MyAllowSpecificOrigins,
                      policy =>
                      {
                          // ** MUY IMPORTANTE PARA DESARROLLO **
                          // Permite cualquier origen (frontend) que llame a tu API.
                          // En PRODUCCI�N, cambia esto a los dominios espec�ficos de tu frontend.
                          policy.AllowAnyOrigin()
                                .AllowAnyHeader()
                                .AllowAnyMethod();
                      });
});

// Opcional: Soporte para Swagger/OpenAPI (�til para probar la API en el navegador)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// --- FIN: Configuraci�n de Servicios ---


var app = builder.Build(); // Construye la aplicaci�n


// --- INICIO: Configuraci�n del Pipeline de Solicitudes HTTP ---

// Configura el pipeline para el entorno de desarrollo (muestra Swagger UI)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection(); // Redirige de HTTP a HTTPS

app.UseAuthorization(); // Para manejo de autenticaci�n (no usado a�n, pero es est�ndar)

// Habilita el enrutamiento para que los controladores puedan manejar las solicitudes
app.UseRouting();

// Aplica la pol�tica CORS. �Esta l�nea debe ir DESPU�S de app.UseRouting() y ANTES de app.MapControllers()!
app.UseCors(MyAllowSpecificOrigins);

app.MapControllers(); // Mapea las rutas a tus controladores (ej. BusesController)

app.Run(); // Inicia la aplicaci�n
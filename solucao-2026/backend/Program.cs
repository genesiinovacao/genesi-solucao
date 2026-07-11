using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Solucao.Backend.Data;
using Solucao.Backend.Middleware;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Fiscal;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddSingleton<IJwtService, JwtService>();
builder.Services.AddScoped<TenantConnectionInterceptor>();

// Fiscal: provider selecionado por config. Só existe o simulado por enquanto —
// um gateway real (Focus NFe, PlugNotas, ...) entra aqui como novo case.
builder.Services.AddSingleton<IFiscalProvider>(sp =>
    builder.Configuration.GetValue("Fiscal:Provider", "simulated") switch
    {
        "simulated" => new SimulatedFiscalProvider(),
        var other => throw new InvalidOperationException($"Fiscal provider desconhecido: {other}"),
    });

builder.Services.AddDbContext<AppDbContext>((sp, opt) =>
{
    var cs = builder.Configuration.GetConnectionString("AppDb")
             ?? throw new InvalidOperationException("ConnectionStrings:AppDb missing");

    opt.UseNpgsql(cs);
    opt.AddInterceptors(sp.GetRequiredService<TenantConnectionInterceptor>());

    if (builder.Environment.IsDevelopment())
    {
        opt.EnableSensitiveDataLogging();
        opt.EnableDetailedErrors();
    }
});

// JWT
var jwtKey = builder.Configuration["Jwt:Key"]
             ?? throw new InvalidOperationException("Jwt:Key missing");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "solucao-backend";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "solucao-clients";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();

// CORS
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                  ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials()));

// MVC + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "SOLUÇÃO 2026 API",
        Version = "v1",
        Description = "Backend multi-tenant para o ERP de varejo SOLUÇÃO. RLS via PostgreSQL."
    });

    var jwtScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Cole apenas o token (sem 'Bearer ').",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
    };
    c.AddSecurityDefinition("Bearer", jwtScheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { { jwtScheme, Array.Empty<string>() } });
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();

app.UseCors();

app.UseAuthentication();
app.UseMiddleware<TenantMiddleware>();   // runs AFTER auth, BEFORE authorize
app.UseAuthorization();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

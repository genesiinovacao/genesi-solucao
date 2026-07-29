using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Solucao.Backend.Data;
using Solucao.Backend.Hubs;
using Solucao.Backend.Middleware;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Billing;
using Solucao.Backend.Services.Fiscal;

var builder = WebApplication.CreateBuilder(args);

// Logs estruturados (console; agregadores de log de qualquer host leem stdout)
builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddScoped<IAuditService, AuditService>();   // LGPD art. 37
builder.Services.AddScoped<IOperatorAuthService, OperatorAuthService>();
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

// PIX: provider selecionado por config, no mesmo padrão do fiscal.
// "simulated" paga sozinho em ~20s (demo); "mercadopago" cobra de verdade.
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("mercadopago");
builder.Services.AddSingleton<IPixProvider>(sp =>
    builder.Configuration.GetValue("Billing:Provider", "simulated") switch
    {
        "simulated" => new SimulatedPixProvider(),
        "mercadopago" => new MercadoPagoPixProvider(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("mercadopago"),
            builder.Configuration["Billing:MercadoPago:AccessToken"]
                ?? throw new InvalidOperationException(
                    "Billing:MercadoPago:AccessToken ausente — defina Billing__MercadoPago__AccessToken.")),
        var other => throw new InvalidOperationException($"PIX provider desconhecido: {other}"),
    });

builder.Services.AddDbContext<AppDbContext>((sp, opt) =>
{
    var cs = builder.Configuration.GetConnectionString("AppDb");
    if (string.IsNullOrWhiteSpace(cs))
        throw new InvalidOperationException(
            "ConnectionStrings:AppDb ausente. Em produção, defina a variável de ambiente ConnectionStrings__AppDb.");

    opt.UseNpgsql(cs);
    opt.AddInterceptors(sp.GetRequiredService<TenantConnectionInterceptor>());

    if (builder.Environment.IsDevelopment())
    {
        opt.EnableSensitiveDataLogging();
        opt.EnableDetailedErrors();
    }
});

// JWT
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
    throw new InvalidOperationException(
        "Jwt:Key ausente. Em produção, defina a variável de ambiente Jwt__Key com um segredo aleatório de 64+ caracteres.");
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

        // SignalR (WebSocket/SSE) não envia header Authorization — o cliente
        // manda o JWT em ?access_token= e ele é aceito apenas nas rotas /hubs.
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    ctx.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// CORS
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                  ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials()));

// SignalR — alertas de estoque em tempo real
builder.Services.AddSignalR();
builder.Services.AddScoped<IStockAlertService, StockAlertService>();

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

app.UseSerilogRequestLogging();

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
app.UseMiddleware<SubscriptionGateMiddleware>(); // 402 se a assinatura venceu além da carência
app.UseAuthorization();

app.MapControllers();
app.MapHub<StockHub>("/hubs/stock");

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

# ============================================================================
# Backend SOLUÇÃO 2026 — build multi-stage
#   docker build -t solucao-backend ./backend
# ============================================================================
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY Solucao.Backend.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# Usuário não-root da imagem base
USER $APP_UID
ENTRYPOINT ["dotnet", "Solucao.Backend.dll"]

import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { auth } from './auth';
import { api } from './api';

// Conexão SignalR com o hub de estoque. O JWT vai em ?access_token=
// (o backend só aceita isso nas rotas /hubs). Reconecta sozinho.
export function createStockConnection() {
  return new HubConnectionBuilder()
    .withUrl(`${api.defaults.baseURL}/hubs/stock`, {
      accessTokenFactory: () => auth.getAccessToken(),
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();
}

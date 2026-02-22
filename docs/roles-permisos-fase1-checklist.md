# Roles y Permisos - Checklist Fase 1

Fecha de referencia: 2026-02-22

Este checklist valida el estado actual de accesos despues de los ajustes de Fase 1:
- guard de rutas en dashboard por prefijo especifico
- sin fallback silencioso al guardar/cargar matriz de permisos con sesion activa

## 1) Matriz esperada por modulo (estado base backend)

Fuente base: `kensar_backend/services/permissions.py`

| Modulo | Administrador | Supervisor | Vendedor | Auditor |
|---|---:|---:|---:|---:|
| dashboard | SI | SI | SI | SI |
| pos | SI | SI | SI | NO |
| documents | SI | SI | SI | NO |
| products | SI | SI | NO | NO |
| labels | SI | SI | SI | NO |
| reports | SI | SI | SI | SI |
| settings | SI | NO | NO | NO |
| users | SI | SI | NO | NO |

Notas:
- `Etiquetado (beta)` hoy cuelga de `labels`.
- `Etiquetado (beta)` tambien pide codigo de acceso en cliente.

## 2) Matriz esperada por rutas dashboard

Fuente base: `kensar_frontend/app/dashboard/layout.tsx`

| Ruta | Modulo evaluado |
|---|---|
| `/dashboard` | `dashboard` |
| `/dashboard/products` | `products` |
| `/dashboard/movements` | `products` |
| `/dashboard/documents` | `documents` |
| `/dashboard/sales` | `documents` |
| `/dashboard/customers` | `documents` |
| `/dashboard/pos` | `pos` |
| `/dashboard/labels` | `labels` |
| `/dashboard/labels-pilot` | `labels` |
| `/dashboard/reports` | `reports` |
| `/dashboard/settings` | `settings` |
| `/dashboard/profile` | libre (usuario autenticado) |

Regla importante:
- Cualquier ruta bajo `/dashboard/*` que no este mapeada arriba debe denegar acceso.

## 3) Pruebas criticas por rol (smoke test)

## Administrador
- Debe entrar a todos los modulos del dashboard.
- Debe entrar a `/dashboard/settings` y poder guardar permisos.
- Debe entrar a `/pos` y vender sin bloqueos.

## Supervisor
- Debe entrar a dashboard, documentos, POS, etiquetas, reportes.
- No debe entrar a `/dashboard/settings`.
- Debe poder operar ventas/devoluciones en POS.

## Vendedor
- Debe entrar a dashboard, documentos, POS, etiquetas y reportes.
- No debe entrar a productos/movimientos/configuracion.
- En POS debe:
  - ver metodos de pago al cobrar
  - poder completar venta
  - imprimir ticket con logo/footer
  - hacer devolucion/cambio sin errores de permisos

## Auditor
- Debe entrar a dashboard y reportes.
- No debe entrar a POS, documentos, etiquetas, productos, configuracion.

## 4) Endpoints criticos a vigilar (operacion POS)

Estos endpoints no deben bloquearse para roles operativos:
- `GET /pos/payment-methods` (permiso: `settings.payment_methods.view`)
- `GET /pos/settings` (permiso: `settings.view`)
- `POST /pos/sales` y asociados (permiso: `pos.sales`)
- `POST /pos/returns` y asociados (permiso: `pos.returns`)

Si un vendedor reporta:
- "No veo metodos de pago" -> revisar `settings.payment_methods.view`
- "No imprime logo/footer" -> revisar `settings.view` y datos de settings

## 5) Checklist de ejecucion sugerido

1. Iniciar sesion con cada uno de los 4 usuarios.
2. Recorrer menu lateral y abrir cada ruta principal permitida.
3. Intentar abrir rutas no permitidas manualmente por URL.
4. Con usuario `Vendedor`, ejecutar venta completa + impresion.
5. Con usuario `Vendedor`, ejecutar devolucion y cambio.
6. Confirmar que no aparecen errores 403 en llamadas criticas del POS.

## 6) Resultado esperado de Fase 1

- El control de acceso del dashboard es consistente por ruta.
- No se enmascaran errores de permisos por fallback local al guardar/cargar matriz.
- `Etiquetado (beta)` queda cubierto por permisos de `labels` a nivel de ruta.

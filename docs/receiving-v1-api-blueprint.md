# Receiving v1 - API Blueprint (Tablet Android)

## 1) Objetivo
Definir contrato tecnico de API para el flujo de recepcion unica en tablet, alineado al SOP v1 y al stack actual de Metrik.

## 2) Alcance v1
Incluye:
- apertura y gestion de lotes,
- captura de productos existentes,
- creacion minima de producto nuevo desde lote,
- cola de etiquetas,
- cierre de lote con impacto en inventario.

No incluye (v1):
- transferencias entre bodegas,
- multi-sede,
- bloqueo duro por etiquetas pendientes,
- flujo avanzado de conteos ciclicos.

## 3) Autenticacion y permisos
- Auth: Bearer token JWT existente de Metrik.
- Reutilizar usuarios/roles actuales.
- Permisos sugeridos nuevos:
  - `receiving.view`
  - `receiving.manage`
  - `receiving.close`
  - `receiving.reopen` (admin/supervisor)

## 4) Entidades (modelo logico)

### receiving_lot
- `id: int`
- `lot_number: str` (ej: `RC-000123`)
- `status: enum(open|closed|cancelled)`
- `purchase_type: enum(invoice|cash)`
- `origin_name: str` (proveedor/origen)
- `source_reference: str | null` (numero factura / nota)
- `notes: str | null`
- `created_by_user_id: int`
- `closed_by_user_id: int | null`
- `created_at: datetime`
- `closed_at: datetime | null`

### receiving_lot_item
- `id: int`
- `lot_id: int`
- `product_id: int`
- `product_name_snapshot: str`
- `sku_snapshot: str | null`
- `barcode_snapshot: str | null`
- `qty_received: float`
- `unit_cost_snapshot: float`
- `unit_price_snapshot: float`
- `is_new_product: bool`
- `notes: str | null`
- `created_at: datetime`
- `updated_at: datetime`

### receiving_label_job
- `id: int`
- `lot_id: int`
- `lot_item_id: int`
- `copies: int`
- `payload_json: object`
- `status: enum(pending|printing|printed|error|cancelled)`
- `attempt_count: int`
- `last_error: str | null`
- `last_attempt_at: datetime | null`
- `printed_at: datetime | null`

### receiving_event_log
- `id: int`
- `lot_id: int`
- `event_type: str`
- `event_data: object | null`
- `actor_user_id: int | null`
- `actor_name: str | null`
- `created_at: datetime`

## 5) Estados y reglas

### Lote
- `open`: editable, permite agregar items y cola de etiquetas.
- `closed`: no editable (solo lectura), impacto aplicado en inventario.
- `cancelled`: solo si no tuvo cierre; no aplica inventario.

### Reglas de cierre
- Permitir cerrar con etiquetas pendientes.
- Si hay pendientes/error, devolver advertencias en respuesta.
- Al cerrar:
  - registrar `InventoryMovement` por item con `reason="purchase"` y `qty_delta > 0`.
  - no permitir doble cierre idempotente.

## 6) Endpoints v1
Base sugerida: `/receiving`

### 6.1 Crear lote
`POST /receiving/lots`

Request:
```json
{
  "purchase_type": "cash",
  "origin_name": "Compra centro",
  "source_reference": "nota-123",
  "notes": "Mercancia audio"
}
```

Validaciones:
- `purchase_type` obligatorio (`invoice|cash`).
- `origin_name` obligatorio (1-120 chars).

Response 201:
```json
{
  "id": 18,
  "lot_number": "RC-000018",
  "status": "open",
  "purchase_type": "cash",
  "origin_name": "Compra centro",
  "source_reference": "nota-123",
  "notes": "Mercancia audio",
  "created_by_user_id": 7,
  "created_at": "2026-02-25T15:10:00Z"
}
```

### 6.2 Listar lotes
`GET /receiving/lots?status=open&skip=0&limit=50&date_from=2026-02-20&date_to=2026-02-25`

Response 200:
```json
{
  "items": [],
  "total": 0,
  "skip": 0,
  "limit": 50
}
```

### 6.3 Obtener lote detalle
`GET /receiving/lots/{lot_id}`

Response 200:
```json
{
  "lot": {},
  "items": [],
  "labels_summary": {
    "pending": 0,
    "printed": 0,
    "error": 0
  },
  "warnings": []
}
```

### 6.4 Agregar item existente al lote
`POST /receiving/lots/{lot_id}/items`

Request:
```json
{
  "product_id": 3519,
  "qty_received": 12,
  "unit_cost": 18000,
  "unit_price": 22000,
  "notes": "Caja x12"
}
```

Validaciones:
- lote en `open`.
- producto existe, activo y no servicio.
- `qty_received > 0`.
- `unit_cost >= 0`, `unit_price >= 0`.

Comportamiento:
- Si item del mismo producto ya existe en lote: acumular cantidad y actualizar snapshots segun ultima entrada (definir politica).

Response 201:
```json
{
  "id": 77,
  "lot_id": 18,
  "product_id": 3519,
  "qty_received": 12,
  "is_new_product": false
}
```

### 6.5 Editar item de lote
`PATCH /receiving/lots/{lot_id}/items/{item_id}`

Request:
```json
{
  "qty_received": 10,
  "unit_cost": 17500,
  "unit_price": 22000,
  "notes": "Ajuste por conteo"
}
```

Validaciones:
- lote `open`.
- `qty_received > 0`.

### 6.6 Eliminar item de lote
`DELETE /receiving/lots/{lot_id}/items/{item_id}`

Regla:
- permitido solo en lote `open`.

Response 204.

### 6.7 Crear producto nuevo minimo y agregar al lote
`POST /receiving/lots/{lot_id}/items/new-product`

Request:
```json
{
  "product": {
    "name": "Cable Plug 3.5mm a 2 RCA",
    "group_name": "Audio",
    "sku": "CBL-PLUG-35-2RCA",
    "barcode": "7701234567890",
    "unit": "unidad",
    "cost": 6500,
    "price": 12000,
    "active": true,
    "service": false,
    "includes_tax": false
  },
  "qty_received": 20,
  "notes": "Nuevo ingreso"
}
```

Validaciones:
- lote `open`.
- campos minimos: `name`, `group_name`, `cost`, `price`, `qty_received`.
- `service=false` obligatorio.
- unicidad SKU si se envia.

Response 201:
```json
{
  "product_id": 5021,
  "lot_item_id": 78,
  "is_new_product": true
}
```

### 6.8 Encolar etiqueta por item
`POST /receiving/lots/{lot_id}/labels/queue`

Request:
```json
{
  "lot_item_id": 78,
  "copies": 20,
  "format": "Kensar"
}
```

Reglas:
- `copies >= 1`.
- construir payload compatible SATO/agente:
  - `CODIGO`, `BARRAS`, `NOMBRE`, `PRECIO`, `format`, `copies`.

Response 201:
```json
{
  "job_id": 9001,
  "status": "pending"
}
```

### 6.9 Listar cola de etiquetas del lote
`GET /receiving/lots/{lot_id}/labels/jobs?status=pending&skip=0&limit=100`

Response 200:
```json
{
  "items": [],
  "total": 0,
  "skip": 0,
  "limit": 100
}
```

### 6.10 Marcar resultado de impresion (desde app)
`POST /receiving/lots/{lot_id}/labels/jobs/{job_id}/result`

Request exito:
```json
{
  "status": "printed"
}
```

Request error:
```json
{
  "status": "error",
  "error_message": "Printer timeout (3000ms)"
}
```

Validaciones:
- transiciones validas de estado.
- incrementar `attempt_count` al intentar imprimir.

### 6.11 Reintentar job de etiqueta
`POST /receiving/lots/{lot_id}/labels/jobs/{job_id}/retry`

Response 200:
```json
{
  "job_id": 9001,
  "status": "pending",
  "attempt_count": 2
}
```

### 6.12 Cerrar lote
`POST /receiving/lots/{lot_id}/close`

Request:
```json
{
  "confirm": true,
  "notes": "Cierre turno tarde"
}
```

Proceso:
1. validar lote `open` y que tenga items.
2. aplicar `InventoryMovement(reason="purchase")` por cada item:
   - `product_id = lot_item.product_id`
   - `qty_delta = +qty_received`
   - `reference_type = "receiving_lot"`
   - `reference_id = lot_id`
3. actualizar lote `closed`.
4. calcular advertencias (labels pendientes/error).

Response 200:
```json
{
  "lot_id": 18,
  "status": "closed",
  "closed_at": "2026-02-25T18:42:00Z",
  "inventory_movements_created": 24,
  "warnings": [
    {
      "code": "LABEL_PENDING",
      "message": "Hay 3 etiquetas pendientes de impresion"
    }
  ]
}
```

### 6.13 Reabrir lote (solo admin/supervisor)
`POST /receiving/lots/{lot_id}/reopen`

Regla:
- solo si politica lo permite y con motivo obligatorio.
- si ya genero movimientos, registrar contramovimientos antes de reabrir o bloquear (recomendado bloquear en v1 para evitar complejidad).

## 7) Contrato de impresion (tablet)

### Payload etiqueta (compatibilidad actual)
```json
[
  {
    "CODIGO": "3519",
    "BARRAS": "3519",
    "NOMBRE": "Microfono Condensador",
    "PRECIO": "$22.000",
    "format": "Kensar",
    "copies": 1
  }
]
```

### Estrategia de envio
1. Primario: `POST http://<IP_SATO>:8081`.
2. Fallback: `POST http://<IP_PC_AGENT>:5177/print`.
3. Resultado:
- exito -> `printed`
- falla -> `error` + mensaje

Nota: no usar `127.0.0.1` en tablet para fallback; debe ser IP LAN del PC agente.

## 8) Errores estandar
Formato sugerido:
```json
{ "detail": "mensaje" }
```
Codigos:
- 400 validacion,
- 401/403 auth/permiso,
- 404 recurso no encontrado,
- 409 conflicto de estado (ej: lote ya cerrado),
- 422 payload invalido,
- 500 error interno.

## 9) Idempotencia y concurrencia
- `close` debe ser idempotente por `lot_id` (si ya esta cerrado, responder 409 o 200 consistente segun politica).
- evitar doble click de cierre usando lock transaccional por lote.
- reintentos de impresion no deben duplicar estado final inconsistente.

## 10) Observabilidad minima
- log de eventos por lote (`receiving_event_log`).
- metricas:
  - tiempo apertura->cierre,
  - items por lote,
  - labels pending/error por lote,
  - ratio nuevos/existentes.

## 11) Orden recomendado de implementacion
1. `POST /lots`, `GET /lots`, `GET /lots/{id}`
2. `POST/PATCH/DELETE /lots/{id}/items`
3. `POST /lots/{id}/items/new-product`
4. `POST /lots/{id}/close` + movimientos inventory
5. endpoints de labels jobs (`queue/result/retry`)
6. `reopen` (si se necesita en piloto)

---
Version: v1
Estado: Ready for implementation

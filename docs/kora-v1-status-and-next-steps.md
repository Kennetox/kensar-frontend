# KORA v1 - Estado Actual y Próximos Pasos

Fecha de corte: 11 de abril de 2026

## 1. Propósito de este documento
Este documento resume lo ya implementado de KORA en Metrik (fase sin IA), el punto exacto donde quedó el proyecto y qué sigue para continuar en otro chat sin perder contexto.

## 2. Repos y archivos principales
Frontend (Metrik):
- `/Users/kennethjaramillo/Projects/kensar_frontend/app/dashboard/components/KoraOpsAssistant.tsx`

Backend (soporte de rutas consultadas por KORA):
- `/Users/kennethjaramillo/Projects/kensar_backend/routers/products.py`

Plan maestro de referencia (alto nivel):
- `/Users/kennethjaramillo/Projects/kensar_web/docs/kora-master-plan.md`

## 3. Estado real de implementación (v1 sin IA)
### 3.1 UI y comportamiento base
- Botón flotante KORA operativo en dashboard.
- Panel de chat funcional con historial local en sesión.
- Cierre por clic fuera del panel.
- Reinicio de conversación.
- Estilo visual adaptado al tema Metrik.

### 3.2 Motor conversacional rule-based (sin IA)
- Detección de intención con normalización de texto.
- Manejo de sinónimos y variantes comunes en español.
- Parser de fechas naturales:
  - hoy, ayer, anteayer
  - formatos numéricos y formatos con mes en texto
- Fallback guiado con botones sugeridos cuando no entiende.
- Confirmación de intención cuando hay ambigüedad.

### 3.3 Memoria conversacional y contexto
- Memoria de contexto por tema (inventario, ventas, web).
- Memoria de entidad:
  - módulo actual
  - producto actual (SKU/término)
  - método de pago
  - fecha consultada
- Follow-ups soportados (ejemplos):
  - “¿y antes de ese?”
  - “¿cuál producto fue?”
  - “¿qué precio tiene?”

### 3.4 Cobertura de consultas operativas implementadas
Ventas y reportes:
- ventas del mes anterior
- ventas por fecha específica
- métodos de pago por fecha
- comparativo mes actual vs mes anterior (mismo corte)
- comparativo anual por método de pago
- producto más vendido del mes
- última venta de un producto y venta anterior

Inventario y productos:
- resumen de inventario
- stock crítico / bajo stock
- consulta de producto por SKU/código
- consulta de grupo del producto
- consulta de precio del producto (follow-up contextual)
- último producto creado/registrado (desde auditoría de productos)

Módulos y playbooks internos:
- guía por módulo
- conexión entre módulos
- playbooks paso a paso para:
  - Inicio
  - Productos
  - Movimientos
  - Documentos
  - POS / Caja
  - Etiquetas
  - Etiquetado (beta)
  - Reportes
  - Comercio Web
  - Inversión
  - Recursos Humanos
  - Configuración

Diagnóstico avanzado:
- cruce Inicio vs Reportes
- diagnóstico de caída de ticket promedio con ranking de causas probables e impacto estimado

### 3.5 Métricas y calidad local
- Registro local de eventos de KORA (handled/fallback/confirm, latencia, input, intent).
- Vista de calidad en Settings (tab KORA) para revisar desempeño local.

## 4. Ajustes recientes importantes
1. Se corrigió error de TypeScript (`never.actions`) en fallback de playbook.
2. Se corrigió fallo backend 405 para consulta de producto por ID:
   - se añadió `GET /products/{product_id}` con permisos y tenant.
3. Se movió estrategia de negocio a SKU-first:
   - KORA prioriza SKU en respuestas y consultas.
   - Si detecta texto tipo `id 524`, responde que se debe usar SKU.
4. Se evitó match por código de barras en búsqueda principal de producto:
   - para “cuál es el producto X” ahora se privilegia SKU/nombre.

## 5. Punto actual exacto (para retomar)
KORA está en una versión avanzada rule-based, útil en operación diaria, pero aún sin capa de IA externa.

Fortaleza actual:
- guía operativa robusta
- consultas útiles de negocio
- buena memoria conversacional contextual

Limitación actual:
- cobertura depende de reglas e intents explícitos
- consultas muy abiertas o no modeladas pueden caer en fallback

## 6. Pendientes recomendados (siguiente fase sin IA)
### Prioridad alta
1. Endurecer parser SKU:
- diferenciar mejor número SKU vs texto ambiguo
- evitar cualquier falsa colisión con nombre o barcode

2. Resolver contexto de producto en cascada:
- precio, grupo, última venta, método de pago del producto consultado
- respuesta consistente aun con preguntas cortas (“¿y costo?”, “¿margen?”)

3. Suite de pruebas de intents:
- 80-120 preguntas reales del equipo
- expected intent + expected output mínimo
- validación de regresión antes de deploy

4. Reglas de negocio más finas:
- umbrales de alertas configurables
- mensajes accionables por rol (Administrador vs otros)

### Prioridad media
1. Cache de consultas más granular (por tipo y rango de fecha).
2. Respuestas multi-acción con jerarquía (qué hacer primero, segundo, tercero).
3. Mejoras de copy para respuesta más corta en móvil.

## 7. Pendientes para fase con IA (cuando se decida)
1. Mantener motor rule-based como primera capa (barata/controlada).
2. Delegar a IA solo consultas ambiguas/complejas.
3. Agregar guardrails:
- whitelists de acciones/rutas
- validación de números y fechas
- confidence threshold
4. Auditoría de respuestas IA y costo por tenant.

## 8. Checklist de continuidad en otro chat
1. Abrir archivo principal:
- `app/dashboard/components/KoraOpsAssistant.tsx`
2. Validar estado con:
- `npm run -s lint` (en `kensar_frontend`)
3. Probar manualmente 15 consultas críticas:
- producto por SKU
- precio y grupo del mismo producto (follow-up)
- ventas por fecha
- métodos de pago por fecha
- comparativo mensual
- diagnóstico de ticket promedio
- guía de RRHH y Configuración
4. Registrar fallbacks reales y priorizar top 10.

## 9. Nota técnica de estabilidad
Al cierre de este documento, lint del frontend está pasando sin errores nuevos de KORA.
Existe un warning no relacionado a KORA en:
- `app/dashboard/profile/page.tsx` línea 280 (`prev` no usado).


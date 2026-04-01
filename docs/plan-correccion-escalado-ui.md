# Plan de correccion de escalado UI

## Objetivo

Este documento define como corregir el escalado visual de `kensar_frontend` despues de descubrir que durante parte del diseno y revision se trabajó con zoom por sitio distinto de `100%` en Safari y Chrome.

Desde que se empezo a constuir el sitio por errores y confusion siempre se diseño y creo con zoom de 85% dentro de safari sin saberlo creyendo que estabamos en 100%, lo que nos lleva a ese punto donde todo lo creado debe ser corregido en su escala

La meta no es rehacer la UI completa ni aplicar cambios bruscos. La meta es recalibrar la interfaz con mucho cuidado, validar cada paso y evitar romper layout, graficas, tablas, modales o flujos operativos.

## Hallazgo base

- Safari tenia `metrikpos.com` en `85%`.
- Chrome tenia `localhost` en `90%`.
- Esto alteró la referencia visual real usada para evaluar tamanos.
- El problema principal no era una diferencia real entre `dev` y `prod`, sino una referencia de zoom equivocada.

## Regla cero

Toda revision y todo ajuste de UI se hace con zoom `100%`.

Checklist minimo antes de revisar cualquier pantalla:

- Safari en `100%`
- Chrome en `100%`
- misma resolucion visible
- misma ventana o una referencia equivalente
- sin usar zoom del navegador como herramienta de diseno

## Principios de trabajo

- Ir lento.
- Cambiar poco por iteracion.
- No mezclar cambios globales con cambios locales en la misma pasada.
- No asumir que algo esta mal por memoria visual vieja.
- Comparar siempre contra captura nueva tomada en `100%`.
- Si un cambio afecta densidad, revisar desktop antes de tocar mobile.
- Pedir confirmacion antes de avanzar a la siguiente capa de cambio.
- Si una iteracion sale mal, revertir de inmediato antes de intentar otra.

## Riesgos principales

Los siguientes cambios son de alto riesgo y no deben hacerse sin una razon muy clara:

- `transform: scale(...)` global
- bajar `font-size` del `html` para toda la app
- ajustes globales agresivos de `line-height`
- reducir alturas/paddings en layout y componentes compartidos a la vez
- compactar varias pantallas simultaneamente

## Estrategia general

Corregir por capas, no por paginas sueltas al azar.

Orden recomendado:

1. Confirmar baseline visual real
2. Identificar que si esta sobredimensionado
3. Ajustar layout global con cambios minimos
4. Ajustar componentes compartidos
5. Ajustar paginas principales una por una
6. Ajustar paginas secundarias
7. Revisar responsive
8. Limpiar codigo temporal de diagnostico

## Baseline visual

Antes de editar:

- tomar capturas nuevas a `100%`
- definir ancho de referencia
- comparar Safari y Chrome en la misma pantalla
- aceptar que la referencia historica previa estaba distorsionada

Anotar siempre:

- ruta
- navegador
- zoom
- ancho visible aproximado
- problema percibido

## Metodo de correccion

Cada iteracion debe tocar una sola capa:

### Capa 1: layout global

Solo si hace falta:

- sidebar width
- header height
- padding general del contenedor
- espaciado vertical entre bloques

No tocar en la misma iteracion:

- cards
- tablas
- graficas
- modales

### Capa 2: componentes compartidos

Ejemplos:

- KPI cards
- tabs y pills
- botones de accion
- chips de estado
- cards base del dashboard

### Capa 3: pantalla puntual

Trabajar una sola pantalla a la vez:

- Inicio
- Movimientos
- Reportes
- Documentos
- POS / Caja

Dentro de una pantalla:

1. Encabezado
2. KPIs
3. bloque principal
4. bloque secundario
5. tablas / listas
6. modales / drawers

## Ritmo obligatorio

El ritmo de trabajo debe ser deliberadamente lento:

1. Inspeccionar
2. Proponer cambio pequeno
3. Aplicar cambio pequeno
4. Recargar
5. Revisar captura
6. Confirmar si mejora o empeora
7. Revertir si el resultado degrada la UI
8. Solo entonces pasar al siguiente ajuste

## Politica de confirmacion

Antes de cualquier cambio global o semi-global, se debe pedir confirmacion explicita.

Cambios que requieren confirmacion:

- layout global del dashboard
- tokens visuales compartidos
- paddings globales
- alturas compartidas
- tipografia base compartida

Cambios que pueden hacerse sin avanzar demasiado:

- una tarjeta puntual
- un bloque puntual
- un espaciado local en una sola pantalla

## Politica de reversion

Si una iteracion produce:

- compresion rara
- elementos vacios o con mucho aire
- graficas deformadas
- jerarquia visual inconsistente
- perdida de legibilidad

entonces se revierte antes de seguir.

No se construye sobre un cambio malo.

## Revisiones obligatorias por iteracion

Cada cambio visual debe revisarse al menos en:

- desktop Safari
- desktop Chrome

Y si el cambio es compartido o global, tambien:

- una pantalla larga con scroll
- una pantalla con tablas
- una pantalla con graficas
- una pantalla con cards KPI

## Pantallas prioritarias

Orden sugerido de correccion:

1. Dashboard Inicio
2. Movimientos
3. Reportes
4. Documentos
5. Productos
6. Configuracion
7. pantallas secundarias

## Regla para otros chats

Si este tema se retoma en otro chat, se debe seguir este contexto:

- ya se descubrio que el zoom historico alteró la referencia visual
- no asumir diferencia `dev` vs `prod` sin medir
- trabajar a `100%`
- ir por capas
- pedir confirmacion antes de cambios globales
- hacer revisiones profundas
- revertir rapido si un cambio degrada la pantalla

## Forma correcta de pedir trabajo en otros chats

Texto sugerido:

`Estamos corrigiendo escalado visual en kensar_frontend despues de descubrir que parte del diseno se evaluo con zoom por sitio distinto de 100%. Quiero trabajar muy despacio, por capas, sin cambios bruscos. No hagas ajustes globales sin confirmacion. Primero inspecciona, luego propone cambios pequenos, revisa impacto, pide confirmacion y solo despues continua. Usa el documento docs/plan-correccion-escalado-ui.md como guia principal.`

## Prohibiciones temporales

Hasta estabilizar la UI, evitar:

- refactors visuales grandes
- cambios esteticos no relacionados
- cambiar muchas pantallas en un solo commit
- mezclar compactacion con rediseño

## Entregable ideal por iteracion

Cada iteracion debe terminar con:

- que se toco
- por que se toco
- que no se toco
- que riesgo queda
- si hace falta confirmar antes del siguiente paso

## Estado actual

Estado base aceptado:

- el hallazgo de zoom ya fue confirmado
- la UI debe recalibrarse a `100%`
- el trabajo debe hacerse lento y con mucha disciplina

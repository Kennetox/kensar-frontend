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

## Registro de avance - 2026-05-27

Esta seccion documenta el avance realizado durante la primera fase real de correccion. El objetivo fue pasar de una UI evaluada accidentalmente con zoom reducido a una experiencia mas equilibrada en navegador a `100%`, sin aplicar escalado global ni rehacer la interfaz completa.

### Criterio usado durante la correccion

- La referencia principal dejo de ser Safari a `85%`.
- Safari a `85%` se uso solo como referencia visual secundaria para entender densidad y composicion.
- La referencia de producto paso a ser navegador a `100%`.
- Se evito usar `transform: scale(...)`, modificar `html font-size` o hacer compactacion global agresiva.
- Se priorizo desktop/laptop, porque Metrik esta pensado principalmente para uso de escritorio.
- Se mantuvo la posibilidad de revertir los cambios de esta fase si el resultado no convencia.

### Paginas publicas ajustadas

Se corrigio la escala inicial de las paginas publicas para que no se vieran sobredimensionadas a `100%`.

Pantallas tocadas:

- Landing principal: `app/page.tsx`
- Descargas: `app/descargas/page.tsx`
- Panel de acceso de descargas: `app/descargas/DownloadsAccessPanel.tsx`
- Contacto: `app/contacto/page.tsx`
- Formulario de ayuda/contacto: `app/contacto/ContactHelpForm.tsx`
- Login: `app/login/page.tsx`
- Descargar POS: `app/descargar-pos/page.tsx`

Cambios principales:

- Se redujeron anchos maximos, paddings, separaciones verticales y tamanos de textos grandes.
- Se corrigieron pies de pagina que quedaban visualmente como bloques/cards innecesarios.
- Se ajustaron alturas de secciones y mapas para que no consumieran demasiado viewport.
- Se cambio el enlace web de contacto a `https://www.kensarelectronic.com`.
- Se mantuvo la composicion general y el estilo existente, sin rediseñar la marca.

Estado:

- Landing, descargas, contacto, login y descargar POS quedaron aceptadas visualmente por ahora.
- Mobile/tablet no fueron el foco principal, aunque se conservaron clases responsivas.

### Layout interno del sistema

Se ajusto la estructura base del dashboard para reducir escala y evitar cortes laterales.

Archivos tocados:

- `app/dashboard/layout.tsx`
- `app/globals.css`

Cambios principales:

- Sidebar desktop y mobile reducido de `w-64` a `w-56`.
- Header/topbar reducido de `h-20` a `h-16`.
- Logo, textos, iconos y spacing del sidebar compactados.
- Navegacion lateral reducida en padding, gap y tamanos de iconos.
- Chip de usuario compactado y limitado con truncado para evitar overflow.
- Se agrego `min-w-0` en wrappers flex del layout para que contenido ancho no empuje ni corte sidebar/topbar.
- Se mantuvo Kora como componente global flotante.

Hallazgo importante:

- Los cortes que aparecian en Productos no eran solo problema de tabla. Tambien faltaba `min-w-0` en contenedores flex compartidos, lo cual permitia que una tabla ancha empujara el layout completo.

Estado:

- Sidebar y header quedaron mas compactos y consistentes.
- El layout compartido ya resiste mejor pantallas con contenido ancho.

### Dashboard Inicio

Se ajusto `app/dashboard/page.tsx` en dos rondas.

Primera ronda:

- Se compacto el contenido general.
- Se redujeron alturas de tarjetas y graficas.
- Se bajo la escala de algunos textos y valores.

Revision posterior:

- El contenido seguia demasiado grande respecto a la referencia visual.
- No tenia los margenes laterales reservados para Kora.
- La seccion `Ultimas ventas` podia chocar con Kora cuando tuviera filas.

Cambios actuales:

- Contenedor principal con margen simetrico similar a Productos: `px-20 xl:px-24`.
- KPIs mas compactos.
- Valores principales reducidos de `text-2xl` a `text-xl`.
- Graficas bajadas de `285px` a `255px`.
- Barras de grafica reducidas.
- Separaciones verticales reducidas.

Estado:

- Requiere revision visual final en `100%` con datos reales y con `Ultimas ventas` poblada.
- El objetivo es mantener el contenido legible, pero evitar que parezca sobredimensionado y que Kora tape funciones.

### Productos

La pantalla de Productos fue la primera pantalla interna con tabla ancha que requirio tratamiento especial.

Archivo principal:

- `app/dashboard/products/page.tsx`

Problemas encontrados:

- La tabla tenia muchas columnas y tendia a empujar el layout.
- El contenido se cortaba en pantallas no muy anchas.
- Kora tapaba controles del paginador inferior.
- El header/filtros de Productos ocupaba demasiado ancho.
- Los formularios de crear/editar producto eran demasiado altos y obligaban scroll innecesario.

Cambios realizados en la pantalla:

- Se agrego `min-w-0` en contenedores clave.
- Se dejo la tabla con scroll interno controlado.
- Se redujo moderadamente padding de celdas y texto de tabla.
- Se ajustaron anchos minimos de columnas clave.
- Se compacto la toolbar y filtros.
- Se redujeron anchos de inputs/selects de filtro.
- Se aplico margen simetrico al modulo completo para dar aire y dejar zona visual para Kora: `px-20 xl:px-24`.
- Se mantuvieron los botones de paginacion en su posicion normal.

Decisiones importantes:

- No se intento hacer que todas las columnas cupieran siempre sin scroll.
- Se acepto que la tabla puede recortarse por dentro y desplazarse horizontalmente.
- El layout general no debe ser empujado por la tabla.

Estado:

- La pantalla ya no corta sidebar/topbar.
- El margen simetrico evita que se vea pegada al borde y reduce choque con Kora.
- Puede requerir ajustes finos por modulo cuando se revisen tablas similares.

### Modales de crear/editar producto

Los modales de producto fueron reestructurados porque los primeros ajustes con `sticky` dentro del contenedor scrolleable quedaron visualmente a medias.

Problemas encontrados:

- Header y footer quedaban pegados al contenido.
- Al expandir `Apariencia en POS`, el contenido pasaba visualmente por debajo del footer.
- El modal completo scrolleaba, lo que hacia que acciones importantes se perdieran o se superpusieran.
- El modal era angosto (`max-w-xl`) para un formulario de muchos campos.

Solucion aplicada:

- Modal ampliado a `max-w-5xl`.
- Estructura separada:
  - header fijo arriba
  - body scrolleable
  - footer fijo abajo
- El formulario ocupa el alto disponible con `flex min-h-0 flex-1 flex-col`.
- El contenido interno del formulario usa `overflow-y-auto`.
- Grid de formulario en 3 columnas en pantallas amplias.
- Inputs, selects, labels y gaps compactados.

Resultado esperado:

- El titulo y cerrar siempre permanecen visibles.
- Las acciones `Eliminar`, `Cancelar`, `Guardar` o `Crear` siempre permanecen visibles.
- Solo scrollea el contenido del formulario.
- La seccion de apariencia puede expandirse sin tapar el footer.

### Apariencia en POS

Se ajusto el bloque expandible `Apariencia en POS (opcional)` dentro del modal de edicion.

Cambios realizados:

- Encabezado del bloque en gris slate claro para diferenciarlo del formulario.
- Panel expandido en `bg-slate-50`.
- Textos y botones adaptados a tema claro dentro del panel.
- Transicion suave al abrir y cerrar usando `grid-template-rows` y `opacity`.
- El contenido permanece montado para que tambien cierre con animacion.

Estado:

- Pendiente revisar visualmente en navegador para confirmar que la animacion se siente natural y que el contraste queda profesional.

## Decisiones tecnicas tomadas

- No usar escalado global.
- No corregir con zoom del navegador.
- Usar `min-w-0` en layouts flex donde el contenido puede crecer.
- Para tablas anchas, preferir scroll interno y contenedores acotados.
- Para Kora, reservar margen local en pantallas donde pueda tapar acciones.
- Para modales complejos, separar header/body/footer en lugar de usar `sticky` dentro del mismo scroll.
- Para acordiones, mantener contenido montado y animar altura/opacidad.

## Validacion realizada

Despues de las iteraciones principales se corrio:

`npm run lint`

Resultado observado:

- Sin errores.
- Persisten 12 warnings preexistentes no relacionados directamente con esta correccion:
  - `app/dashboard/profile/page.tsx`
  - `app/dashboard/reports/detailed/page.tsx`
  - `app/pos/page.tsx`

Estos warnings no fueron abordados en esta fase para no mezclar limpieza tecnica con correccion visual.

## Riesgos y puntos pendientes

- Revisar Dashboard Inicio con ventas reales y lista `Ultimas ventas` poblada.
- Revisar Productos con diferentes anchos de ventana y con scroll horizontal de tabla.
- Revisar modales de crear/editar producto en Chrome y Safari a `100%`.
- Revisar si otras pantallas con tablas anchas necesitan el mismo patron de Productos.
- Revisar si Kora debe tener una estrategia global de posicion o si se mantiene ajuste por pantalla.
- Evitar seguir compactando hasta que cada pantalla revisada sea aprobada visualmente.

## Proximo orden sugerido

1. Terminar revision visual de Dashboard Inicio.
2. Cerrar ajustes finos de Productos y modales.
3. Pasar a Movimientos con el mismo enfoque.
4. Seguir con Documentos o Reportes, priorizando pantallas con tablas.
5. Documentar cada bloque terminado en esta misma bitacora.

# Guía de Prefijos de Documentos (Metrik)

Esta guía resume los prefijos de documentos usados en el ecosistema de Metrik y su propósito operativo.

## Formato general

- Estructura típica: `PREFIJO-000001`
- El número es consecutivo interno por tipo de documento.

## Prefijos y significado

1. `V-`  
Documento: Venta POS  
Uso: ticket o factura de venta generada en caja.

2. `DV-`  
Documento: Devolución  
Uso: registro de devolución sobre una venta.

3. `CB-`  
Documento: Cambio  
Uso: registro de cambio de productos sobre una venta.

4. `OW-`  
Documento: Orden web  
Uso: orden creada desde el checkout del canal web.

5. `RC-`  
Documento: Recepción  
Uso: lote de recepción de mercancía en inventario.

6. `RCN-`  
Documento: Recuento  
Uso: documento de recuento de inventario.

7. `CL-`  
Documento: Cierre de caja  
Uso: consecutivo del cierre (reporte Z).

8. `SM-`  
Documento: Salida manual  
Uso: movimiento manual de salida de stock.

9. `VM-`  
Documento: Venta manual  
Uso: movimiento manual tipo venta interna.

10. `AJ-`  
Documento: Ajuste  
Uso: ajuste manual de inventario.

11. `PD-`  
Documento: Pérdida / daño  
Uso: registro manual de merma o daño.

12. `MM-`  
Documento: Movimiento manual (fallback)  
Uso: prefijo de respaldo cuando un tipo manual no está mapeado explícitamente.

## Nota operativa

- Algunos módulos también manejan IDs internos o referencias externas, pero para trazabilidad documental de operación el identificador principal visible es el prefijo + consecutivo.

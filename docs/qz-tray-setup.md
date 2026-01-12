# Guia de configuracion QZ Tray (Metrik POS)

Esta guia deja la impresion funcionando en minutos en cualquier equipo.

## 1) Instalar QZ Tray
1. Descarga desde https://qz.io/download/
2. Instala la version mas reciente para tu sistema.
3. Abre QZ Tray (debe quedar activo en la barra de menu o bandeja).

## 2) Importar el certificado del POS
Necesitas el certificado publico del API para que QZ confie en las firmas.

1. Abre en el navegador:
   https://api.metrikpos.com/pos/qz/cert
2. Guarda el contenido como archivo:
   - macOS: `qz_api.crt`
   - Windows: `qz_api.crt`
3. Abre QZ Tray > Site Manager.
4. En "Allowed", elimina entradas antiguas de `metrikpos.com` si existen.
5. Pulsa "+" y selecciona `qz_api.crt`.
6. Verifica que el "Fingerprint" coincida con el que devuelve el API.

### macOS: si no permite importar
Algunas versiones de QZ en macOS no importan por el UI. Usa el override:

```bash
sudo cp ~/Downloads/qz_api.crt "/Applications/QZ Tray.app/Contents/Resources/override.crt"
```

Luego reinicia QZ Tray.

## 3) Configurar en el POS
1. En el POS: Menu > Configurar impresora.
2. Selecciona "Conector local (QZ Tray)".
3. Pulsa "Detectar impresoras" y elige la impresora correcta.
4. Guarda.

## 4) Validar
1. Imprime un ticket de prueba.
2. Si aparece "Invalid Signature":
   - El certificado importado no coincide con el que firma el backend.
   - Repite el paso 2 con el cert correcto.

## Variables en el servidor (solo admin)
Estas variables deben existir en el backend:
- `QZ_CERT`: certificado publico en base64 (sin saltos de linea).
- `QZ_PRIVATE_KEY`: llave privada en base64 (sin saltos de linea).
- `QZ_SIGNATURE_ALGO=sha1` (recomendado para QZ Tray 2.2.x).

## Notas rapidas
- El certificado es el mismo para todos los equipos.
- Cada equipo debe importar el cert al menos una vez.
- Si QZ no detecta impresoras, revisa que el sistema operativo las tenga instaladas.

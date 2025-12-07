# Formulario de Pago con Google Pay Autofill

Este formulario está configurado para activar la función de Chrome de "Guardar en Google Pay".

## Requisitos para que funcione el Autofill de Google Pay

1. **HTTPS**: El sitio DEBE estar en HTTPS. Chrome no ofrece guardar tarjetas en sitios HTTP.
2. **Atributos autocomplete**: Ya están configurados correctamente (`cc-number`, `cc-exp`, `cc-csc`, `cc-name`)
3. **Método POST**: El formulario usa POST para que Chrome lo detecte como envío real
4. **Netlify Forms**: Configurado para manejar el envío correctamente

## Deployment en Netlify

1. Conecta este repositorio a Netlify
2. Netlify detectará automáticamente los archivos HTML
3. El sitio estará disponible en HTTPS automáticamente
4. Netlify Forms procesará los envíos del formulario

## Para probar

1. Abre el sitio en Chrome (versión HTTPS de Netlify)
2. Completa el formulario con datos de tarjeta válidos
3. Al hacer clic en "Pagar Ahora", Chrome debería mostrar el prompt de "Guardar tarjeta"

**Nota**: Chrome puede no mostrar el prompt si:
- Estás en modo incógnito
- Ya tienes esa tarjeta guardada
- El sitio no está en HTTPS

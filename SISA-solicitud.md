# Solicitud de acceso a los servicios web de SISA

Esto es lo único que falta para que el portal consulte REFEPS automáticamente
cuando una matrícula no está en la base local.

**No lo puedo hacer yo:** hay que crear una cuenta a nombre de Proteger Salud y
presentar una solicitud formal que aprueba una persona del Ministerio de Salud.

---

## Paso 1 — Crear la cuenta en SISA

Entrar a <https://sisa.msal.gov.ar/sisa/> y registrar un usuario a nombre de la
farmacia. Guardar el usuario y la clave: son los que después van al portal.

## Paso 2 — Mandar este mail

**Para:** soporte@sisa.msal.gov.ar
**Asunto:** Solicitud de acceso a servicios web REFEPS - Formulario A1

> Estimados,
>
> Me dirijo a ustedes para solicitar el acceso a los servicios web de SISA,
> específicamente a los del módulo REFEPS (Registro Federal de Profesionales de
> la Salud), y el envío del Formulario A1 de Solicitud de Acceso.
>
> **Datos del solicitante**
> - Razón social: *(completar)*
> - CUIT: *(completar)*
> - Domicilio: *(completar)*
> - Responsable: *(nombre y apellido, DNI)*
> - Correo de contacto: *(completar)*
> - Teléfono: *(completar)*
> - Usuario SISA ya registrado: *(completar)*
>
> **Uso previsto**
> Somos una red de farmacias. Necesitamos verificar la matrícula del profesional
> que firma una receta al momento de dispensar, para confirmar que corresponde a
> un profesional habilitado. La consulta la haría nuestro sistema interno contra
> el servicio WS021 (consulta múltiple de profesionales), por número de
> matrícula, con un volumen estimado de *(completar: consultas por día)*.
>
> El uso es exclusivamente sanitario, en el marco de la dispensa de
> medicamentos, y los datos no se comparten con terceros.
>
> Quedo a disposición por cualquier documentación adicional que necesiten.
>
> Saludos cordiales,
> *(nombre, cargo)*

## Paso 3 — Cargar las credenciales

Cuando aprueben el acceso, en Netlify:

**Site settings → Environment variables → Add a variable**

```
SISA_USUARIO = (el usuario)
SISA_CLAVE   = (la clave)
```

Después hay que redesplegar para que la función las tome. Nada más: el portal
detecta solas las credenciales y el fallback se activa.

---

## Cómo saber si quedó andando

```bash
curl "https://portalprotegersalud.netlify.app/api/sisa?matricula=100000"
```

- `501` + `"Credenciales SISA no configuradas"` → todavía no están cargadas.
- `200` + una lista de resultados → funcionando.
- `502` + `"Credenciales SISA inválidas"` → usuario o clave mal, o el permiso de
  servicios web todavía no fue habilitado para esa cuenta.

## Mientras tanto

El buscador funciona igual con la base local: 98.073 profesionales de CABA y
Buenos Aires. Si una matrícula no figura, el portal lo dice y ofrece el link al
buscador público de SISA para consultarla a mano.

# Integra: GitHub + Supabase + Render

Guía para conectar los tres servicios y tener la app desplegada con URL pública y base de datos persistente.

---

## Flujo general

```
GitHub (código)  →  Render (hosting)  →  Supabase (base de datos)
     push              despliega              guarda datos
```

---

## 1. GitHub (código)

Tu proyecto ya está en: **https://github.com/Gabo-GPT/Integra**

Para subir cambios:

```cmd
cd C:\Users\Sistemas\integra-local
git add .
git commit -m "Tu mensaje"
git push origin main
```

---

## 2. Supabase (base de datos)

Ya configurado. Credenciales:

- **URL:** `https://xkvtdomfracutwcljovv.supabase.co`
- **Secret key:** en tu `.env` como `SUPABASE_SERVICE_KEY`

Tabla `app_data` creada. Los datos persisten en la nube.

---

## 3. Render (hosting + URL pública)

### Paso 1: Crear cuenta

1. Entra a [render.com](https://render.com)
2. **Get started for free**
3. Inicia sesión con **GitHub**

### Paso 2: Crear Web Service

1. **Dashboard** → **New +** → **Web Service**
2. Conecta **GitHub** si aún no está conectado (autoriza a Render)
3. Selecciona el repo **Gabo-GPT/Integra**
4. Clic en **Connect**

### Paso 3: Configurar el servicio

| Campo | Valor |
|-------|-------|
| **Name** | `integra` (o el nombre que prefieras) |
| **Region** | Elige el más cercano |
| **Branch** | `main` |
| **Root Directory** | (dejar vacío) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### Paso 4: Variables de entorno

En **Environment** → **Add Environment Variable**, añade:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://xkvtdomfracutwcljovv.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(copia tu Secret key desde Supabase → API Keys)* |

(O copia el valor desde tu `.env` local)

### Paso 5: Crear el servicio

1. **Create Web Service**
2. Render descargará el código de GitHub, instalará dependencias y arrancará la app
3. Espera unos minutos hasta que el estado sea **Live**

### Paso 6: URL pública

Render te dará una URL similar a:
`https://integra-xxxx.onrender.com`

---

## 4. Actualización automática

Cuando hagas `git push` a GitHub, Render desplegará de nuevo la app.  
No hace falta hacer nada manual en Render.

---

## 5. Resumen

| Servicio | Rol | URL / Dato |
|----------|-----|------------|
| **GitHub** | Código | github.com/Gabo-GPT/Integra |
| **Supabase** | Base de datos | xkvtdomfracutwcljovv.supabase.co |
| **Render** | Hosting público | integra-xxxx.onrender.com |

---

## Solución de problemas

**La app no arranca en Render**
- Revisa los logs en Render → **Logs**
- Confirma que `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` estén bien definidos

**La app se “duerme”**
- En plan gratis, Render apaga el servicio tras ~15 min sin uso
- La primera visita puede tardar 30–60 segundos

**Datos no se guardan**
- Comprueba las variables de entorno en Render
- Revisa en Supabase → **Table Editor** → `app_data` que los datos se estén insertando

# CONTEXT FRONTEND — Sistema de Conciliación — Cointra S.A.S.

## Stack
- **Framework:** React (Vite)
- **Estilos:** TailwindCSS
- **Routing:** React Router v6
- **Estado global:** Context API + useReducer (o Zustand si se prefiere)
- **HTTP:** Axios
- **Tablas:** TanStack Table (react-table)
- **Formularios:** React Hook Form
- **Notificaciones UI:** react-hot-toast
- **Iconos:** Lucide React
- **Excel download:** xlsx (SheetJS)

---

## Principios de diseño

El sistema debe sentirse como una plataforma SaaS moderna (Notion / Stripe / Linear):
- Limpio, minimalista, agradable para uso durante muchas horas
- Paleta suave que no canse la vista
- Información distribuida en cards, paneles y tabs — no formularios largos en columna
- Acciones principales siempre visibles
- Componentes modernos: tablas con búsqueda, filtros, modales, badges de estado

---

## Paleta de colores

```js
// tailwind.config.js
colors: {
  primary:   "#3B82F6",   // azul — acciones principales
  success:   "#10B981",   // verde — aprobado
  warning:   "#F59E0B",   // amarillo — en revisión
  danger:    "#EF4444",   // rojo — rechazado
  neutral:   "#64748B",   // texto secundario
  bg:        "#F8FAFC",   // fondo general
  sidebar:   "#1E293B",   // sidebar oscuro
  border:    "#E2E8F0",   // bordes
  text:      "#1E293B",   // texto principal
}
```

---

## Layout principal

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR: Logo | Título página | Usuario | Rol        │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │         CONTENIDO PRINCIPAL              │
│          │    (cards, tablas, paneles, modales)      │
│  Nav     │                                          │
│  items   │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Sidebar items por rol

**COINTRA:**
- Dashboard
- Operaciones
- Conciliaciones
- Clientes
- Terceros
- Usuarios

**CLIENTE:**
- Dashboard
- Mis Conciliaciones

**TERCERO:**
- Dashboard
- Mis Conciliaciones

---

## Estructura de carpetas

```
frontend/src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx
│   │   ├── Topbar.jsx
│   │   └── Layout.jsx
│   ├── ui/
│   │   ├── Badge.jsx           ← badge de estado con colores
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Modal.jsx
│   │   ├── Table.jsx           ← tabla reutilizable con búsqueda
│   │   ├── Tabs.jsx
│   │   ├── Input.jsx
│   │   ├── Select.jsx
│   │   └── EmptyState.jsx
│   ├── conciliaciones/
│   │   ├── ConciliacionCard.jsx
│   │   ├── ConciliacionDetalle.jsx
│   │   ├── ItemsTable.jsx
│   │   ├── FormItem.jsx
│   │   ├── UploadExcel.jsx
│   │   ├── ModalManifiesto.jsx  ← buscar manifiesto Avansat
│   │   ├── ModalCorreo.jsx      ← enviar correo con destinatario editable
│   │   └── ModalObservacion.jsx
│   └── operaciones/
│       ├── OperacionCard.jsx
│       └── FormOperacion.jsx
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── Operaciones.jsx
│   ├── ConciliacionesLista.jsx
│   ├── ConciliacionDetalle.jsx
│   ├── Clientes.jsx
│   ├── Terceros.jsx
│   └── Usuarios.jsx
├── services/
│   ├── api.js                  ← instancia Axios con interceptors JWT
│   ├── authService.js
│   ├── conciliacionService.js
│   ├── itemService.js
│   ├── operacionService.js
│   ├── avansatService.js
│   └── correoService.js
├── context/
│   ├── AuthContext.jsx          ← usuario, token, rol
│   └── AppContext.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useConciliaciones.js
│   └── useItems.js
└── utils/
    ├── formatters.js            ← formatCOP, formatDate
    ├── permissions.js           ← canView, canEdit por rol
    └── constants.js             ← estados, tipos, roles
```

---

## Componente Badge de estado

```jsx
const ESTADO_STYLES = {
  BORRADOR:     "bg-gray-100 text-gray-600",
  EN_REVISION:  "bg-yellow-100 text-yellow-700",
  APROBADA:     "bg-green-100 text-green-700",
  CERRADA:      "bg-slate-100 text-slate-500",
  PENDIENTE:    "bg-gray-100 text-gray-500",
  APROBADO:     "bg-green-100 text-green-700",
  RECHAZADO:    "bg-red-100 text-red-600",
}

export function Badge({ estado }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ESTADO_STYLES[estado] || "bg-gray-100 text-gray-500"}`}>
      {estado.replace("_", " ")}
    </span>
  )
}
```

---

## Página Dashboard

```
┌─────────────────────────────────────────────────┐
│  Cards resumen (según rol):                     │
│  [Conciliaciones activas] [En revisión] [Cerradas]│
├─────────────────────────────────────────────────┤
│  Tabla: Últimas conciliaciones                  │
│  Nombre | Operación | Tipo | Estado | Período   │
│  [filtro estado] [filtro tipo] [búsqueda]        │
└─────────────────────────────────────────────────┘
```

---

## Página Detalle de Conciliación

```
┌──────────────────────────────────────────────────────┐
│ ← Volver    "Segunda quincena feb - Siberia"         │
│             Operación: Siberia | Estado: [EN REVISION]│
├──────────┬───────────────────────────────────────────┤
│ RESUMEN  │  Tarifa cliente total:  $X.XXX.XXX        │
│ (cards)  │  Rentabilidad Cointra:  $XXX.XXX  (solo Cointra)│
│          │  Valor al tercero:      $X.XXX.XXX (solo Cointra)│
├──────────┴───────────────────────────────────────────┤
│  [Agregar ítem]  [Cargar Excel]  [Enviar al cliente] │
│  [Enviar correo]                                     │
├──────────────────────────────────────────────────────┤
│  Tabla de ítems con columnas según rol               │
│  Fecha | Origen | Destino | Placa | Tarifa | Estado  │
│  [Asociar manifiesto] [Aprobar] [Rechazar] por fila  │
└──────────────────────────────────────────────────────┘
```

---

## Modal envío de correo

```jsx
// ModalCorreo.jsx
// Campo destinatario editable + asunto predefinido + cuerpo simple
<Modal>
  <h2>Enviar notificación por correo</h2>
  <Input label="Para:" value={destinatario} onChange={...} placeholder="correo@empresa.com" />
  <Input label="Asunto:" value={asunto} disabled />
  <Textarea label="Mensaje:" value={cuerpo} disabled />  {/* texto plano predefinido */}
  <Button onClick={enviar}>Enviar correo</Button>
</Modal>
```

---

## Modal búsqueda manifiesto Avansat

```jsx
// ModalManifiesto.jsx
// Se abre desde la fila del viaje
// Filtra automáticamente por placa, origen y destino del viaje
// Muestra lista de manifiestos sin facturar
// El usuario selecciona uno y se asocia al viaje
<Modal>
  <h2>Asociar manifiesto Avansat</h2>
  <p>Placa: {viaje.placa} | {viaje.origen} → {viaje.destino}</p>
  <Table
    data={manifiestos}
    columns={["Manifiesto", "Fecha", "Placa", "Origen", "Destino", "Producto"]}
    onSelect={(m) => asociarManifiesto(viaje.id, m)}
  />
</Modal>
```

---

## Control de visibilidad por rol (utils/permissions.js)

```js
export const canSeeRentabilidad = (rol) => rol === "COINTRA"
export const canSeeTarifaTercero = (rol) => ["COINTRA", "TERCERO"].includes(rol)
export const canSeeTarifaCliente = (rol) => ["COINTRA", "CLIENTE"].includes(rol)
export const canEditarTarifa = (rol) => rol === "COINTRA"
export const canAprobar = (rol) => ["COINTRA", "CLIENTE"].includes(rol)
export const canVerTodasConciliaciones = (rol) => rol === "COINTRA"
```

---

## Formatters (utils/formatters.js)

```js
export const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

export const formatDate = (date) =>
  new Date(date).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })
```

---

## Axios interceptor (services/api.js)

```js
import axios from "axios"

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token")
      window.location.href = "/login"
    }
    return Promise.reject(err)
  }
)

export default api
```

---

## Buenas prácticas UX para este sistema

1. **Badges de color** en todos los estados — el usuario entiende el estado de un vistazo.
2. **Tablas con filtros y búsqueda** — las conciliaciones pueden tener muchos ítems.
3. **Confirmación antes de acciones irreversibles** — aprobar, rechazar, cerrar.
4. **Feedback inmediato** — toasts de éxito/error después de cada acción.
5. **Loading states** — skeleton loaders mientras cargan datos.
6. **Roles visibles** — mostrar claramente en el topbar qué rol tiene el usuario activo.
7. **Empty states descriptivos** — si no hay conciliaciones, explicar qué hacer.
8. **Formularios cortos** — un modal para agregar un ítem, no una página entera.
9. **El botón de enviar correo** aparece solo cuando aplica — no siempre visible.
10. **Exportar a Excel/PDF** siempre disponible en el detalle de conciliación.

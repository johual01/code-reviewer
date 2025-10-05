# Code Reviewer - VS Code Extension

Una extensión de VS Code que proporciona análisis inteligente de código JavaScript y TypeScript utilizando IA para detectar problemas, violaciones de principios SOLID y oportunidades de mejora.

## Características

- 🤖 **Análisis con IA**: Utiliza inteligencia artificial para análisis profundo del código
- 🏗️ **Principios SOLID**: Detecta violaciones de los principios SOLID de programación
- 📊 **Evaluación de calidad**: Proporciona puntuaciones de estilo y complejidad
- 🔧 **Sugerencias de mejora**: Ofrece código mejorado y acciones recomendadas
- ⚡ **Integración VS Code**: Diagnósticos y comentarios directamente en el editor
- 🎯 **Soporte GitHub**: Autenticación automática usando tu cuenta de GitHub en VS Code

## Requisitos

### Backend
Esta extensión requiere que el backend de Code Reviewer esté ejecutándose. El backend debe estar disponible en:
```
http://localhost:3000
```

### Variables de entorno
Crea un archivo `.env` en el directorio raíz de la extensión con:
```
HOST=http://localhost:3000
```

Para usar variables de entorno, instala dotenv:
```bash
npm install dotenv
```

Y agrega al inicio de `extension.js`:
```javascript
require('dotenv').config();
```

### Dependencias
- Node.js
- VS Code cuenta GitHub conectada
- Backend de Code Reviewer ejecutándose

## Instalación

1. Clona este repositorio
2. Ejecuta `npm install` para instalar dependencias
3. Asegúrate de que el backend esté ejecutándose
4. Presiona `F5` para ejecutar la extensión en modo desarrollo

## Configuración

### Archivo de configuración
La extensión busca un archivo `config_cr.yml` en la raíz de tu proyecto para configurar las reglas de análisis.

Ejemplo de `config_cr.yml`:
```yaml
rules:
  - SOLID_SRP
  - SOLID_OCP
  - SOLID_LSP
  - SOLID_ISP
  - SOLID_DIP
```

## Uso

### Comandos disponibles

1. **Code Reviewer: Revisar Código** (`code-reviewer.review`)
   - Analiza el archivo actualmente abierto
   - Genera diagnósticos y comentarios en el editor
   - Muestra evaluación de calidad del código

2. **Code Reviewer: Configurar** (`code-reviewer.config`)
   - Configura la extensión y actualiza reglas
   - Se ejecuta automáticamente al iniciar

3. **Code Reviewer: Resolver Diagnóstico** (`code-reviewer.resolveDiagnostic`)
   - Marca un diagnóstico como resuelto

### Flujo de trabajo

1. **Inicio automático**: La extensión se configura automáticamente al cargar VS Code
2. **Análisis manual**: Usa `Ctrl+Shift+P` > "Code Reviewer: Revisar Código"
3. **Análisis automático**: Al guardar archivos JS/TS, se pregunta si deseas analizar
4. **Revisión de resultados**: Los problemas aparecen como diagnósticos en el editor
5. **Aplicar mejoras**: Usa las sugerencias para mejorar tu código

## Estructura de respuesta de la API

### Objeto Issue
```typescript
interface Issue {
  ruleCode: string;           // Código único de la regla
  title: string;              // Título descriptivo del problema
  message: string;            // Descripción del problema
  severity: 'error' | 'warning' | 'suggestion';
  line: number;               // Línea donde ocurre el problema
  column: number;             // Columna donde ocurre el problema
  codeBefore: string;         // Código problemático actual
  codeAfter: string;          // Código sugerido mejorado
  action: string;             // Acción recomendada
}
```

### Objeto Evaluation
```typescript
interface Evaluation {
  styleScore: number;         // Puntuación de estilo (0-100)
  complexity: number;         // Nivel de complejidad
  issuesCount: number;        // Cantidad de problemas encontrados
}
```

## Problemas conocidos

- Solo soporta archivos JavaScript (.js) y TypeScript (.ts)
- Requiere conexión a internet para el análisis con IA
- El backend debe estar ejecutándose para funcionar

## Notas de versión

### 1.0.0
- Lanzamiento inicial con análisis básico de código
- Integración con backend de IA
- Soporte para principios SOLID
- Autenticación GitHub automática

---

## Desarrollo

### Estructura del proyecto
```
├── extension.js          # Punto de entrada principal
├── service.js            # Comunicación con backend
├── diagnostic.js         # Manejo de diagnósticos
├── comment.js            # Comentarios en editor
├── package.json          # Configuración de la extensión
└── resources/            # Recursos estáticos
```

### API del Backend
La extensión se comunica con el backend usando los siguientes endpoints:

- `POST /auth/session` - Autenticación
- `POST /rules/config-changed` - Configuración de reglas
- `POST /analyze` - Análisis de archivos

Para más detalles, consulta las instrucciones de Copilot en `.github/copilot-instructions.md`.

**¡Disfruta mejorando tu código!**

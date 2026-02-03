// 1. Configuración de Firebase (Tus credenciales reales)
// 1. Configuración de Firebase (Tus credenciales reales)
// 1. CONFIGURACIÓN (Asegúrate de que no falte ninguna coma)
const firebaseConfig = {
    apiKey: "AIzaSyBu3yo2VhQCP_VeBX3Y-6fQ-Wii-mFVqg0",
    authDomain: "cancioneroidp.firebaseapp.com",
    projectId: "cancioneroidp",
    storageBucket: "cancioneroidp.firebasestorage.app",
    messagingSenderId: "372639793133",
    appId: "1:372639793133:web:fbe5bc52185d67c272f1e4",
    measurementId: "G-J62GC64DDT"
};

// 2. INICIALIZACIÓN GLOBAL (Esto soluciona el error de foldersCol)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
firebase.firestore().enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          // Probablemente múltiples pestañas abiertas a la vez
          console.log('La persistencia falló: múltiples pestañas abiertas');
      } else if (err.code == 'unimplemented') {
          // El navegador no soporta esta función
          console.log('El navegador no soporta persistencia offline');
      }
  });
const db = firebase.firestore();
const notesCol = db.collection('notes');
const foldersCol = db.collection('folders');

// 3. VARIABLES DE ESTADO Y DICCIONARIO MUSICAL
const scaleSharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleFlat  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
let useFlats = false; // Por defecto usaremos sostenidos

// 3. VARIABLES DE ESTADO
let notes = [];
let folders = [];
let currentFolder = "Notas";
let currentNoteId = null;
let searchQuery = "";
  
function transpose(semitones) {
    const textarea = document.getElementById('note-textarea');
    if (!textarea) return;

    let text = textarea.value;
    
    // 1. Decidir escala
    if (text.includes('b')) {
        useFlats = true;
    } else if (text.includes('#')) {
        useFlats = false;
    }

    // 2. LA CLAVE: Añadimos (?![a-z]) al final de la nota base.
    // Esto evita que cambie la "D" de "Desde" o la "A" de "Amor".
    const chordRegex = /([A-G][b#]?)(?![a-z])(m|maj|dim|aug|sus|add|7|9|11|13|M)*/g;

    const newText = text.replace(chordRegex, (fullMatch, baseNote, suffix) => {
        let index = scaleSharp.indexOf(baseNote);
        if (index === -1) index = scaleFlat.indexOf(baseNote);
        
        if (index === -1 && typeof flats !== 'undefined' && flats[baseNote]) {
            index = scaleSharp.indexOf(flats[baseNote]);
        }

        if (index === -1) return fullMatch;

        let newIndex = (index + semitones) % 12;
        if (newIndex < 0) newIndex += 12;
        
        const newBaseNote = useFlats ? scaleFlat[newIndex] : scaleSharp[newIndex];
        return newBaseNote + (suffix || "");
    });

    textarea.value = newText;
    
    if (currentNoteId) {
        notesCol.doc(currentNoteId).update({ content: newText });
    }
}
async function createNewNote() {
    try {
        // Determinamos a qué carpetas pertenece la nota nada más nacer
        // Siempre pertenece a "Notas" (general) y a la carpeta que tengas abierta
        const foldersToAssign = currentFolder === "Notas" ? ["Notas"] : ["Notas", currentFolder];

        const docRef = await notesCol.add({
            content: "", // Nace vacía
            folders: foldersToAssign, // <--- ESTO ES LO QUE HACE QUE APAREZCA YA
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 1. Guardamos el ID de la nota nueva
        currentNoteId = docRef.id;

        // 2. Abrimos el editor inmediatamente
        const editor = document.getElementById('editor-view');
        const textarea = document.getElementById('note-textarea');
        if (editor && textarea) {
            textarea.value = "";
            editor.classList.add('active');
            setTimeout(() => textarea.focus(), 300);
        }

        // 3. Forzamos el refresco visual para que la veas aparecer en la lista de atrás
        renderNotes();

    } catch (e) {
        console.error("Error al crear nota:", e);
    }
}

function openNote(id) {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    // 1. Cargamos el texto bruto en el textarea para cuando el usuario quiera editar
    const textarea = document.getElementById('note-textarea');
    textarea.value = note.content;

    // 2. Creamos la versión con colores para el "Visor"
    // Si tienes un div para previsualizar, úsalo aquí:
    const viewer = document.getElementById('note-viewer'); 
    if (viewer) {
        viewer.innerHTML = formatMusicalText(note.content);
    }

    // 3. Abrimos el editor
    document.getElementById('editor-view').classList.add('active');
    
    // Solo hacemos focus si queremos que el teclado salga de inmediato
    setTimeout(() => textarea.focus(), 300);
}

function formatMusicalText(text) {
    if (!text) return "";

    // Esta expresión es más estricta:
    // 1. Busca notas de A a G
    // 2. Permite sostenidos, bemoles y tipos de acorde (m, 7, etc)
    // 3. (?![a-z]) -> Bloquea el resaltado si la siguiente letra es minúscula (ej: Di-os)
    const chordRegex = /\b([A-G](?:#|b)?(?:m|maj7|sus4|add9|7|sus|2|4|5)?)(?![a-z])/g;

    return text.split('\n').map(line => {
        // Clonamos la línea para no perder los espacios originales (muy importante en música)
        let hasChords = false;
        const highlightedLine = line.replace(chordRegex, match => {
            hasChords = true;
            return `<span class="chord-highlight">${match}</span>`;
        });

        if (hasChords) {
            return `<div class="music-line">${highlightedLine}</div>`;
        }
        return `<div class="plain-line">${line}</div>`;
    }).join('\n');
}

async function saveAndClose() {
    const textarea = document.getElementById('note-textarea');
    if (!textarea || !currentNoteId) return;

    const newContent = textarea.value;

    try {
        // 1. Guardamos en Firebase
        await notesCol.doc(currentNoteId).update({
            content: newContent,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. TRUCO VITAL: Actualizamos manualmente la nota en nuestro array local
        // Esto hace que la lista cambie SIN tener que esperar a Firebase ni cambiar de pestaña
        const noteIndex = notes.findIndex(n => n.id === currentNoteId);
        if (noteIndex !== -1) {
            notes[noteIndex].content = newContent;
        }

        // 3. Cerramos el editor
        document.getElementById('editor-view').classList.remove('active');

        // 4. Refrescamos la lista inmediatamente
        renderNotes();

    } catch (e) {
        console.error("Error al guardar:", e);
        alert("No se pudo guardar la nota.");
    }
}

async function addNewFolder() {
    const n = prompt("Nombre de la nueva carpeta:");
    if (!n) return;

    // Validación: Evitar carpetas con el mismo nombre
    const folderExists = folders.some(f => f.name.toLowerCase() === n.toLowerCase());
    if (folderExists) {
        alert("Esa carpeta ya existe.");
        return;
    }

    try {
        await foldersCol.add({ 
            name: n, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        // No hace falta llamar a renderFolders(), el onSnapshot lo hará solo
    } catch (error) {
        console.error("Error al añadir carpeta:", error);
        alert("Hubo un error al guardar la carpeta.");
    }
}

// --- LÓGICA DE VINCULACIÓN ---
// 1. Esta función solo se encarga de mostrar el panel
function openPicker() {
    const picker = document.getElementById('folder-picker');
    if (picker) {
        // Usamos flex para mostrarlo según tu lógica
        picker.style.display = 'flex'; 
        picker.classList.add('active');
        // Llamamos a la función que dibuja la lista
        renderFolderPicker(); 
    }
}

// 2. Esta función dibuja la lista corrigiendo el [object Object]
function renderFolderPicker() {
    const list = document.getElementById('picker-list');
    if (!list) return;

    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    // 1. Eliminamos duplicados por nombre y limpiamos la lista
    const uniqueFolders = [];
    const seenNames = new Set();

    folders.forEach(f => {
        const name = (typeof f === 'object') ? f.name : f;
        if (name && !seenNames.has(name)) {
            seenNames.add(name);
            uniqueFolders.push({ id: f.id || 'default', name: name });
        }
    });

    // 2. Dibujamos la lista limpia
    list.innerHTML = uniqueFolders.map(f => {
        const isLinked = note.folders && note.folders.includes(f.name);

        return `
            <div class="picker-item" onclick="toggleFolderLink('${f.name}')" 
                 style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; cursor: pointer;">
                <span style="color: #333; font-weight: 500;">${f.name}</span>
                <span style="color: #007aff; font-weight: bold;">${isLinked ? '✓' : ''}</span>
            </div>
        `;
    }).join('');
}

// 3. El buscador (sin cambios, pero limpio)
function handleSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        searchQuery = input.value.toLowerCase();
        renderNotes();
    }
}
async function deleteFolder(folderId, folderName) {
    if (folderName === "Notas" || !confirm(`¿Borrar carpeta "${folderName}"?`)) return;

    try {
        await foldersCol.doc(folderId).delete();
        const batch = db.batch();
        notes.filter(n => n.folders && n.folders.includes(folderName)).forEach(note => {
            const newFolders = note.folders.filter(name => name !== folderName);
            if (!newFolders.includes("Notas")) newFolders.push("Notas");
            batch.update(notesCol.doc(note.id), { folders: newFolders });
        });
        await batch.commit();
        if (currentFolder === folderName) currentFolder = "Notas";
    } catch (e) {
        console.error("Error al borrar:", e);
    }
}
async function toggleFolderLink(folderName) {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note.folders.includes(folderName)) {
        const newFolders = [...note.folders, folderName];
        await notesCol.doc(currentNoteId).update({ folders: newFolders });
    }
    closePicker();
}

async function removeNoteFromCurrentFolder() {
    if (!currentNoteId) return;

    // 1. Lógica de eliminación o desvinculación
    if (currentFolder === "Notas") {
        const confirmDelete = confirm("¿Deseas eliminar esta nota de TODAS las carpetas?");
        if (confirmDelete) {
            await notesCol.doc(currentNoteId).delete();
        } else {
            return; 
        }
    } else {
        const note = notes.find(n => n.id === currentNoteId);
        if (!note) return;
        
        const newFolders = (note.folders || []).filter(f => f !== currentFolder);
        await notesCol.doc(currentNoteId).update({ folders: newFolders });
    }

    // 2. CERRAR EL EDITOR
    const editor = document.getElementById('editor-view');
    if (editor) editor.classList.remove('active');

    // 3. ¡ESTA ES LA CLAVE DEL REFRESCO!
    // Forzamos a la lista a actualizarse con los datos que ya tenemos en memoria
    // o esperamos un milisegundo a que el onSnapshot reaccione.
    setTimeout(() => {
        renderNotes();
        renderFolders();
    }, 100); 
}

function closePicker() { document.getElementById('folder-picker').style.display = 'none'; }

function selectFolder(name) {
    currentFolder = name;
    renderFolders();
    renderNotes();
}

// --- RENDERIZADO ---

// --- FUNCIONES DE CARPETAS ---

function renderFolders() {
    const bar = document.getElementById('folder-bar');
    if (!bar) return;

    const mainFolderName = "Notas";
    const otherFolders = folders.filter(f => f.name !== mainFolderName)
                                .sort((a, b) => a.name.localeCompare(b.name));
    
    const mainFolderObj = folders.find(f => f.name === mainFolderName) || { id: 'default', name: 'Notas' };
    const sortedFolders = [mainFolderObj, ...otherFolders];

    bar.innerHTML = sortedFolders.map(f => {
        const isMain = f.name === mainFolderName;
        const isSelected = f.name === currentFolder;
        const count = notes.filter(n => n.folders && n.folders.includes(f.name)).length;
        
        return `
            <div class="folder-chip ${isSelected ? 'active' : ''}">
                <span onclick="selectFolder('${f.name}')" style="cursor:pointer;">
                    ${f.name} <span class="folder-count">${count}</span>
                </span>
                ${!isMain ? `
                    <button type="button" onclick="deleteFolder('${f.id}', '${f.name}')" 
                            style="background:none; border:none; color:inherit; margin-left:8px; padding:0; cursor:pointer; display:flex; align-items:center;">
                        <i data-lucide="x" style="width:14px; height:14px;"></i>
                    </button>
                ` : ''}
            </div>`;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

function renderFolderPicker() {
    const container = document.getElementById('picker-list');
    if (!container) return;
    
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    container.innerHTML = folders.map(f => {
        // ESCUDO: Si f es un objeto, toma .name. Si es texto, úsalo directo.
        const name = (f && typeof f === 'object') ? f.name : f;
        
        // Si por algún error el nombre es null o undefined, ponemos un texto de respaldo
        const folderDisplayName = name || "Carpeta sin nombre";
        const isLinked = note.folders && note.folders.includes(folderDisplayName);
        
        return `
            <div class="picker-item" onclick="toggleFolderLink('${folderDisplayName}')" 
                 style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; cursor:pointer;">
                <span style="color:#333; font-weight:500;">${folderDisplayName}</span>
                ${isLinked ? '<i data-lucide="check" style="color:#007aff; width:18px;"></i>' : ''}
            </div>`;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

// --- FIN DE FUNCIONES DE CARPETAS ---
// 1. FUNCIÓN DE BÚSQUEDA (Faltaba en tu código y causaba el error)
function handleSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        searchQuery = input.value.toLowerCase();
        renderNotes();
    }
}

// 2. FUNCIÓN PARA SELECCIONAR CARPETA
function selectFolder(folderName) {
    currentFolder = folderName;
    renderFolders();
    renderNotes();
}

// 3. PICKER DE CARPETAS (Corregido para evitar [object Object])
function renderFolderPicker() {
    const container = document.getElementById('picker-list');
    if (!container) return;
    
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    container.innerHTML = folders.map(f => {
        // --- ESTA ES LA LÓGICA DE EXTRACCIÓN SEGURA ---
        let folderName = "";
        
        if (typeof f === 'object' && f !== null) {
            // Si es un objeto, intentamos sacar .name
            folderName = f.name || "Sin nombre";
        } else {
            // Si ya era un texto, lo usamos tal cual
            folderName = f;
        }
        
        const isLinked = note.folders && note.folders.includes(folderName);
        
        return `
            <div class="picker-item" onclick="toggleFolderLink('${folderName}')" 
                 style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; cursor: pointer;">
                <span style="color: #333; font-weight: 500;">${folderName}</span>
                ${isLinked ? '<i data-lucide="check" style="color:#007aff; width:18px;"></i>' : ''}
            </div>
        `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

// 4. RENDERIZADO DE NOTAS
function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    list.innerHTML = '';

    let filtered = notes.filter(n => {
        // REGLA DE ORO: Si es la nota que estoy escribiendo ahora mismo, MOSTRAR SIEMPRE
        if (n.id === currentNoteId) return true;

        const isInFolder = (currentFolder === "Notas") || 
                           (n.folders && n.folders.includes(currentFolder));
        
        const content = n.content || "";
        const matchesSearch = content.toLowerCase().includes(searchQuery);
        
        return isInFolder && matchesSearch;
    });

    // Ordenar: Las más nuevas o editadas recientemente primero suele ser mejor, 
    // pero mantenemos tu orden alfabético si lo prefieres:
    filtered.sort((a, b) => (a.content || "").localeCompare(b.content || ""));

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; margin-top:2rem;">No hay notas aquí</div>`;
        return;
    }

    const groups = {};
    filtered.forEach(n => {
        const firstChar = (n.content && n.content.trim() !== "") ? n.content.trim()[0].toUpperCase() : "N";
        if (!groups[firstChar]) groups[firstChar] = [];
        groups[firstChar].push(n);
    });

    Object.keys(groups).sort().forEach(letter => {
        list.innerHTML += `<div class="alphabet-header">${letter}</div>`;
        groups[letter].forEach(note => {
            const lines = (note.content || "").split('\n');
            const title = lines[0].trim() || "Nueva nota";
            const preview = lines[1] || "Ver nota...";

            list.innerHTML += `
                <div class="note-item ${note.id === currentNoteId ? 'active-note' : ''}" onclick="openNote('${note.id}')">
                    <span style="font-weight:600; display:block;">${title}</span>
                    <span style="font-size:0.85rem; color:gray;">${preview}</span>
                </div>`;
        });
    });
    if (window.lucide) lucide.createIcons();
}

// 5. CONEXIÓN REAL-TIME
window.onload = () => {
    // Escuchar Carpetas
    foldersCol.orderBy('name').onSnapshot(snap => {
        // 1. Obtenemos las carpetas de Firebase filtrando CUALQUIER "Notas" que exista en la DB
       let firebaseFolders = snap.docs
        .map(doc => ({ id: doc.id, name: doc.data().name }))
        .filter(f => f.name !== "Notas");

        // 2. Creamos la lista final poniendo "Notas" manualmente UNA SOLA VEZ
        folders = [{ id: 'default', name: 'Notas' }, ...firebaseFolders];
    renderFolders();
    renderFolderPicker();
});

    // Escuchar Notas
    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const editor = document.getElementById('editor-view');
        
        // Importante: Aquí solo refrescamos lo visual
        if (editor && !editor.classList.contains('active')) {
            renderNotes();
            renderFolders();
        }
    });
};

// --- EXPORTACIÓN GLOBAL ---
window.handleSearch = handleSearch;
window.selectFolder = selectFolder;
window.renderFolderPicker = renderFolderPicker;
window.renderNotes = renderNotes;

// (Asegúrate de que estas funciones existan arriba en tu archivo)
window.createNewNote = typeof createNewNote !== 'undefined' ? createNewNote : null;
window.addNewFolder = typeof addNewFolder !== 'undefined' ? addNewFolder : null;
window.deleteFolder = typeof deleteFolder !== 'undefined' ? deleteFolder : null;
window.transpose = typeof transpose !== 'undefined' ? transpose : null;
window.saveAndClose = typeof saveAndClose !== 'undefined' ? saveAndClose : null;
window.openNote = typeof openNote !== 'undefined' ? openNote : null;
window.openPicker = typeof openPicker !== 'undefined' ? openPicker : null;
window.closePicker = typeof closePicker !== 'undefined' ? closePicker : null;
window.toggleFolderLink = typeof toggleFolderLink !== 'undefined' ? toggleFolderLink : null;

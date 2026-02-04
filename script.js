// 1. Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBu3yo2VhQCP_VeBX3Y-6fQ-Wii-mFVqg0",
    authDomain: "cancioneroidp.firebaseapp.com",
    projectId: "cancioneroidp",
    storageBucket: "cancioneroidp.firebasestorage.app",
    messagingSenderId: "372639793133",
    appId: "1:372639793133:web:fbe5bc52185d67c272f1e4",
    measurementId: "G-J62GC64DDT"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

firebase.firestore().enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          // Probablemente varias pestañas abiertas a la vez
          console.log('Persistencia falló: Multi-pestaña');
      } else if (err.code == 'unimplemented') {
          // El navegador no lo soporta (muy raro en iPhone/Chrome moderno)
          console.log('Persistencia no disponible');
      }
  });

const db = firebase.firestore();
const notesCol = db.collection('notes');
const foldersCol = db.collection('folders');

// 2. Variables de Estado
const scaleSharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleFlat  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
let useFlats = false;
let notes = [];
let folders = [];
let currentFolder = "Notas";
let currentNoteId = null;
let searchQuery = "";
const PIN_CORRECTO = "019283";

// --- FUNCIONES DE SEGURIDAD (PIN) ---

function enterEditMode() {
    const modal = document.getElementById('pin-modal');
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    
    if (modal) {
        input.value = ""; 
        error.style.opacity = "0"; 
        modal.style.display = 'flex'; 
        setTimeout(() => input.focus(), 100);
    }
}
let pendingAction = null; 

// 1. Inicia el proceso de seguridad
function secureAction(actionType) {
    console.log("Acción segura iniciada:", actionType);
    pendingAction = actionType;
    
    const modal = document.getElementById('pin-modal');
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    
    if (modal) {
        input.value = "";
        if (error) error.style.opacity = "0";
        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 100);
    } else {
        console.error("No se encontró el modal del PIN en el HTML");
    }
}

// 2. Verifica el código 019283
function verifyPin() {
    const input = document.getElementById('pin-input').value;
    const error = document.getElementById('pin-error');
    
    // Usamos el código que definiste: 019283
    if (input === "019283") {
        document.getElementById('pin-modal').style.display = 'none';
        
        if (pendingAction === 'delete') {
            removeNoteFromCurrentFolder(); // Esta función ya existe en tu código
        } else if (pendingAction === 'edit') {
            document.getElementById('view-mode').style.display = 'none';
            document.getElementById('edit-mode').style.display = 'flex';
            setTimeout(() => document.getElementById('note-textarea').focus(), 100);
        }
        pendingAction = null; 
    } else {
        if (error) {
            error.style.opacity = "1";
            error.innerText = "PIN Incorrecto";
        }
        document.getElementById('pin-input').value = "";
    }
}

function closePinModal() {
    document.getElementById('pin-modal').style.display = 'none';
}

function exitEditMode() {
    // Guardar cambios al salir
    const content = document.getElementById('note-textarea').value;
    if (currentNoteId) {
        notesCol.doc(currentNoteId).update({ 
            content: content,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('view-mode').style.display = 'flex';
    updateSongDisplay();
}

// --- FUNCIONES DE VISUALIZACIÓN ---

function updateSongDisplay() {
    const text = document.getElementById('note-textarea').value;
    const display = document.getElementById('song-display');
    if (!display) return;

    // Esta Regex ahora es más permisiva con números pero estricta con minúsculas
    const chordRegex = /(?<![a-zA-Z])([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus4|sus2|sus|add9|13|11|9|7|5|4|2|M)?(?![a-záéíóú])(?![A-Z])/g;

    display.innerHTML = text.split('\n').map(line => {
        // Simplemente resaltamos acordes sin importar si hay // o no
        const highlighted = line.replace(chordRegex, match => {
            return `<span class="chord-highlight">${match}</span>`;
        });

        // Mantenemos la estructura de línea exacta
        return `<div>${highlighted || '&nbsp;'}</div>`;
    }).join('');
}

// --- FUNCIONES DE NOTAS ---

function transpose(semitones) {
    const textarea = document.getElementById('note-textarea');
    const songDisplay = document.getElementById('song-display');
    if (!textarea || !songDisplay) return;

    let text = textarea.value;
    const scaleSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scaleFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const useFlats = /\b[A-G]b\b|\b[A-G]b(m|7|maj)/.test(text);
    const chordRegex = /\b([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus\d?|add\d?|7|9|11|13|5|M|b5)?(?![a-zñóáéíú])/g;

    const newText = text.replace(chordRegex, (fullMatch, baseNote, suffix) => {
        let index = scaleSharp.indexOf(baseNote);
        if (index === -1) index = scaleFlat.indexOf(baseNote);
        if (index === -1) return fullMatch;

        let newIndex = (index + semitones + 12) % 12;
        const newBaseNote = useFlats ? scaleFlat[newIndex] : scaleSharp[newIndex];
        return newBaseNote + (suffix || "");
    });

    // IMPORTANTE: Solo actualizamos lo que se VE, no lo que está guardado en Firebase
    textarea.value = newText;
    updateSongDisplay(); 
    
    // NOTA: Aquí NO hay llamadas a Firebase. El cambio es 100% temporal.
}
async function createNewNote() {
    try {
        const newNoteRef = await notesCol.add({
            content: "", 
            folders: ["Notas"], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentNoteId = newNoteRef.id;
        
        document.getElementById('note-textarea').value = "";
        updateSongDisplay();
        
        document.getElementById('editor-view').classList.add('active');
        // Al ser nota nueva, entramos directo a editar sin PIN (opcional) o pidiendo PIN
        enterEditMode(); 
    } catch (e) { console.error("Error al crear:", e); }
}

function openNote(id) {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    document.getElementById('note-textarea').value = note.content;
    updateSongDisplay();

    document.getElementById('editor-view').classList.add('active');
    document.getElementById('view-mode').style.display = 'flex';
    document.getElementById('edit-mode').style.display = 'none';
}

function saveAndClose() {
    // 1. Antes de cerrar, recuperamos la nota original de nuestro array local
    // Esto descarta cualquier cambio de tono que hayamos hecho en el textarea
    const originalNote = notes.find(n => n.id === currentNoteId);
    if (originalNote) {
        document.getElementById('note-textarea').value = originalNote.content;
        updateSongDisplay();
    }

    // 2. Cerramos el editor/visor
    document.getElementById('editor-view').classList.remove('active');
    
    // 3. Limpiamos la variable de ID actual para seguridad
    currentNoteId = null;
}

// --- FUNCIONES DE CARPETAS Y OTROS ---

async function addNewFolder() {
    const n = prompt("Nombre de la nueva carpeta:");
    if (!n) return;
    if (folders.some(f => f.name.toLowerCase() === n.toLowerCase())) return alert("Ya existe");
    try {
        await foldersCol.add({ name: n, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) { console.error(e); }
}

async function deleteFolder(id, name) {
    if (name === "Notas") return;
    if (confirm(`¿Eliminar carpeta "${name}"? Las notas seguirán en "Notas".`)) {
        await foldersCol.doc(id).delete();
    }
}

function selectFolder(name) {
    currentFolder = name;
    renderFolders();
    renderNotes();
}

function openPicker() {
    const picker = document.getElementById('folder-picker');
    if (picker) {
        picker.style.display = 'flex';
        renderFolderPicker();
    }
}
function undoText() {
    const textarea = document.getElementById('note-textarea');
    if (!textarea) return;

    // 1. Ponemos el foco en el texto (Indispensable para iOS)
    textarea.focus();

    // 2. Ejecutamos el comando de deshacer del sistema
    try {
        document.execCommand('undo', false, null);
    } catch (e) {
        console.warn("El navegador no soporta execCommand, usando fallback");
    }

    // 3. Actualizamos el visor para que el cambio se vea reflejado
    if (typeof updateSongDisplay === "function") {
        updateSongDisplay();
    }
}
function closePicker() { document.getElementById('folder-picker').style.display = 'none'; }

function renderFolderPicker() {
    const container = document.getElementById('picker-list');
    if (!container || !currentNoteId) return;
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    container.innerHTML = folders.map(f => {
        const isLinked = note.folders && note.folders.includes(f.name);
        return `
            <div class="picker-item" onclick="toggleFolderLink('${f.name}')">
                <span style="color:#333; font-weight:500;">${f.name}</span>
                <span style="color:#007aff; font-weight:bold; font-size:1.2rem;">${isLinked ? '✓' : ''}</span>
            </div>`;
    }).join('');
}
async function exitEditMode() {
    const newContent = document.getElementById('note-textarea').value;

    if (currentNoteId) {
        try {
            // Guardar en Firebase
            await notesCol.doc(currentNoteId).update({
                content: newContent,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Actualizar localmente
            const note = notes.find(n => n.id === currentNoteId);
            if (note) note.content = newContent;

            // Refrescar el visor de la canción
            updateSongDisplay();
            
            // Volver a la vista normal
            document.getElementById('edit-mode').style.display = 'none';
            document.getElementById('view-mode').style.display = 'block';
        } catch (error) {
            console.error("Error al guardar:", error);
            alert("No se pudo guardar la nota.");
        }
    }
}
async function toggleFolderLink(folderName) {
    if (!currentNoteId) return;
    const noteRef = notesCol.doc(currentNoteId);
    const note = notes.find(n => n.id === currentNoteId);
    const isLinked = note.folders && note.folders.includes(folderName);

    try {
        if (isLinked) {
            if (folderName === "Notas") return; 
            await noteRef.update({ folders: firebase.firestore.FieldValue.arrayRemove(folderName) });
        } else {
            await noteRef.update({ folders: firebase.firestore.FieldValue.arrayUnion(folderName) });
        }
        renderFolderPicker();
    } catch (e) { console.error("Error vinculando:", e); }
}

async function removeNoteFromCurrentFolder() {
    if (!currentNoteId) {
        console.error("No hay un ID de nota seleccionado");
        return;
    }

    const mensaje = currentFolder === "Notas" 
        ? "¿Eliminar esta nota permanentemente?" 
        : `¿Quitar de la carpeta "${currentFolder}"?`;

    if (confirm(mensaje)) {
        try {
            // Referencia directa al documento
            const noteRef = notesCol.doc(currentNoteId);

            if (currentFolder === "Notas") {
                // BORRADO TOTAL
                await noteRef.delete();
            } else {
                // SOLO QUITAR DE CARPETA
                await noteRef.update({
                    folders: firebase.firestore.FieldValue.arrayRemove(currentFolder)
                });
            }

            // IMPORTANTE: Primero cerramos la vista, luego limpiamos el ID
            document.getElementById('editor-view').classList.remove('active');
            
            // Esperamos un poco antes de limpiar el ID para evitar conflictos con otras funciones
            setTimeout(() => {
                currentNoteId = null;
            }, 500);

        } catch (e) {
            console.error("Error al borrar/quitar:", e);
            alert("No se pudo completar la acción. La nota tal vez ya fue borrada.");
        }
    }
}

function renderFolders() {
    const bar = document.getElementById('folder-bar');
    if (!bar) return;
    bar.innerHTML = folders.map(f => {
        const isSelected = f.name === currentFolder;
        const count = notes.filter(n => n.folders && n.folders.includes(f.name)).length;
        return `
            <div class="folder-chip ${isSelected ? 'active' : ''}">
                <span onclick="selectFolder('${f.name}')" style="cursor:pointer;">
                    ${f.name} <span class="folder-count">${count}</span>
                </span>
                ${f.name !== 'Notas' ? `
                    <button onclick="deleteFolder('${f.id}', '${f.name}')" style="background:none; border:none; margin-left:8px;">
                        <i data-lucide="x" style="width:14px;"></i>
                    </button>` : ''}
            </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}
function openEditMode() {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    // 1. Llenamos el textarea con el texto de la nota
    const textarea = document.getElementById('note-textarea');
    textarea.value = note.content || "";

    // 2. Cambiamos de pantalla
    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';

    // 3. Opcional: Ajustar altura del textarea automáticamente
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    
    // 4. Inicializar iconos de Lucide (por el botón de deshacer)
    if (window.lucide) lucide.createIcons();
}
function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    const filtered = notes.filter(n => {
        const inFolder = (currentFolder === "Notas") || (n.folders && n.folders.includes(currentFolder));
        return inFolder && (n.content || "").toLowerCase().includes(searchQuery);
    }).sort((a,b) => (a.content||"").localeCompare(b.content||""));

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; margin-top:2rem;">No hay notas</div>`;
        return;
    }

    const groups = {};
    filtered.forEach(n => {
        const char = n.content ? n.content.trim()[0].toUpperCase() : "N";
        if (!groups[char]) groups[char] = [];
        groups[char].push(n);
    });

    list.innerHTML = "";
    Object.keys(groups).sort().forEach(letter => {
        list.innerHTML += `<div class="alphabet-header">${letter}</div>`;
        groups[letter].forEach(note => {
            const lines = note.content.split('\n');
            list.innerHTML += `
                <div class="note-item" onclick="openNote('${note.id}')">
                    <span style="font-weight:600; display:block;">${lines[0] || "Nueva nota"}</span>
                    <span style="font-size:0.85rem; color:gray;">${lines[1] || "Ver nota..."}</span>
                </div>`;
        });
    });
}
// Ejemplo de cómo cargar notas priorizando el almacenamiento local
function loadNotes() {
    // Intentar cargar con la configuración de caché
    notesCol.orderBy('title').onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
        const source = snapshot.metadata.fromCache ? "local" : "servidor";
        console.log("Cargando datos desde: " + source);
        
        notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFolders();
        renderNotes();
    }, (error) => {
        console.error("Error al cargar notas:", error);
    });
}
function handleSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        searchQuery = input.value.toLowerCase();
        renderNotes();
    }
}

window.onload = () => {
    foldersCol.orderBy('name').onSnapshot(snap => {
        const fbFolders = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })).filter(f => f.name !== "Notas");
        folders = [{ id: 'default', name: 'Notas' }, ...fbFolders];
        renderFolders();
    });

    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNotes();
        renderFolders();
    });
    
    // Escuchar Enter en el PIN
    document.getElementById('pin-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyPin();
    });
};

// --- EXPORTACIÓN ---
window.enterEditMode = enterEditMode;
window.verifyPin = verifyPin;
window.closePinModal = closePinModal;
window.exitEditMode = exitEditMode;
window.handleSearch = handleSearch;
window.selectFolder = selectFolder;
window.createNewNote = createNewNote;
window.addNewFolder = addNewFolder;
window.deleteFolder = deleteFolder;
window.transpose = transpose;
window.saveAndClose = saveAndClose;
window.openNote = openNote;
window.openPicker = openPicker;
window.closePicker = closePicker;
window.toggleFolderLink = toggleFolderLink;
window.removeNoteFromCurrentFolder = removeNoteFromCurrentFolder;

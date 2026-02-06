/// 1. CONFIGURACIÓN DE FIREBASE (ACTUALIZADA)
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

const db = firebase.firestore();

// Nueva forma de persistencia para evitar el error de consola en CodePen/APK
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
db.enablePersistence({synchronizeTabs:true}).catch((err) => {
    console.warn("Persistencia desactivada:", err.code);
});

const notesCol = db.collection('notes');

// 2. VARIABLES DE ESTADO GLOBALES
const scaleSharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleFlat  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
let notes = []; 
let currentFolder = "LISTA DE CANCIONES";
let currentNoteId = null;
let pendingAction = null;
const PIN_CORRECTO = "019283";

// --- 3. SISTEMA DE SEGURIDAD (PIN) ---

function secureAction(actionType) {
    pendingAction = actionType;
    const modal = document.getElementById('pin-modal');
    if (modal) {
        document.getElementById('pin-input').value = "";
        document.getElementById('pin-error').style.opacity = "0";
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('pin-input').focus(), 100);
    }
}

function verifyPin() {
    const input = document.getElementById('pin-input').value;
    const error = document.getElementById('pin-error');
    
    if (input === PIN_CORRECTO) {
        document.getElementById('pin-modal').style.display = 'none';
        if (pendingAction === 'delete') {
            removeNoteFromCurrentFolder();
        } else if (pendingAction === 'edit') {
            openEditMode();
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

// --- 4. GESTIÓN DEL EDITOR (HTML CONTENTEDITABLE) ---

function openEditMode() {
    let note = findNoteById(currentNoteId);
    if (!note) return;

    const editor = document.getElementById('note-textarea');
    
    // USA innerHTML para que el navegador interprete las etiquetas y no las escriba
    editor.innerHTML = note.content || ""; 

    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'flex';
}

async function exitEditMode() {
    const editor = document.getElementById('note-textarea');
    const newContent = editor.innerHTML; 

    if (currentNoteId) {
        try {
            // 1. Actualizar en la Nube (si existe allí)
            if (notes.some(n => n.id === currentNoteId)) {
                await notesCol.doc(currentNoteId).update({
                    content: newContent,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // 2. Sincronizar copia local inmediatamente
            saveNoteLocally({ id: currentNoteId, content: newContent });

            updateSongDisplay();
            document.getElementById('edit-mode').style.display = 'none';
            document.getElementById('view-mode').style.display = 'flex';
        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Error al guardar cambios.");
        }
    }
}

function applyFormat(command, value = null) {
    document.execCommand(command, false, value);

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);

    // Salto de formato: Insertamos un espacio de ancho cero para "romper" la etiqueta
    const zwsp = document.createTextNode('\u200B'); 
    range.collapse(false);
    range.insertNode(zwsp);
    range.setStartAfter(zwsp);
    range.setEndAfter(zwsp);
    selection.removeAllRanges();
    selection.addRange(range);

    // Obligamos a Safari a resetear el estilo en el nuevo punto
    document.execCommand('removeFormat', false, null);
    
    document.getElementById('note-textarea').focus();
    if (window.updateSongDisplay) window.updateSongDisplay();
}

// --- 5. VISUALIZACIÓN Y ACORDES ---

function updateSongDisplay() {
    const editor = document.getElementById('note-textarea');
    const display = document.getElementById('song-display');
    if (!editor || !display) return;

    let content = editor.innerHTML;
    // Regex estricta para acordes
    const chordRegex = /(?<![a-zA-Z])([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus4|sus2|sus|add9|13|11|9|7|5|4|2|M)?(?![a-záéíóú])(?![A-Z])/g;

    // Procesamos líneas respetando el formato del editor
    let lines = content.split(/<div>|<br>|<\/div>/);

    display.innerHTML = lines.map(line => {
        if (line.trim() === "" && line !== "") return "";
        const highlighted = line.replace(chordRegex, match => `<span class="chord-highlight">${match}</span>`);
        return `<div class="song-line">${highlighted || '&nbsp;'}</div>`;
    }).join('');
}

function transpose(semitones) {
    const editor = document.getElementById('note-textarea');
    if (!editor) return;

    let htmlContent = editor.innerHTML;
    const useFlats = /\b[A-G]b\b|\b[A-G]b(m|7|maj)/.test(htmlContent);
    const chordRegex = /\b([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus\d?|add\d?|7|9|11|13|5|M|b5)?(?![a-zñóáéíú])/g;

    const newHtml = htmlContent.replace(chordRegex, (fullMatch, baseNote, suffix) => {
        let index = scaleSharp.indexOf(baseNote);
        if (index === -1) index = scaleFlat.indexOf(baseNote);
        if (index === -1) return fullMatch;

        let newIndex = (index + semitones + 12) % 12;
        const newBaseNote = useFlats ? scaleFlat[newIndex] : scaleSharp[newIndex];
        return newBaseNote + (suffix || "");
    });

    editor.innerHTML = newHtml;
    updateSongDisplay();
}

// --- 6. MANEJO DE NOTAS (NUBE Y LOCAL) ---

function findNoteById(id) {
    let note = notes.find(n => n.id === id);
    if (!note) {
        const offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
        note = offlineNotes[id];
    }
    return note;
}

function openNote(id) {
    currentNoteId = id;
    const note = findNoteById(id);
    if (!note) return;

    // 1. Forzar visibilidad del contenedor principal del editor
    const editorView = document.getElementById('editor-view');
    editorView.style.display = 'block'; // O 'flex' según tu CSS
    editorView.classList.add('active');

    // 2. Inyectar contenido
    const textarea = document.getElementById('note-textarea');
    textarea.innerHTML = note.content || "";
    
    // 3. Resetear el scroll al inicio
    textarea.scrollTop = 0;

    updateSongDisplay();

    document.getElementById('view-mode').style.display = 'flex';
    document.getElementById('edit-mode').style.display = 'none';
}

async function createNewNote() {
    try {
        const initial = "";
        
        // 1. Aseguramos el ID: Capturamos la respuesta de Firebase
        const newRef = await notesCol.add({
            content: initial,
            folders: ["LISTA DE CANCIONES"],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Asignamos el ID a la variable global
        currentNoteId = newRef.id;
        
        // 2. Cargamos el texto inicial en el editor
        document.getElementById('note-textarea').innerHTML = initial;
        updateSongDisplay();

        // 3. Forzamos la apertura: Mostramos el editor y ocultamos la vista previa
        document.getElementById('editor-view').classList.add('active'); // Abre la pantalla
        document.getElementById('view-mode').style.display = 'none';    // Oculta lectura
        document.getElementById('edit-mode').style.display = 'flex';    // Muestra edición
        
        // 4. Ponemos el cursor listo para escribir
        setTimeout(() => document.getElementById('note-textarea').focus(), 100);

    } catch (e) { 
        console.error(e);
        alert("Error al crear nota."); 
    }
}

// --- 7. RENDERIZADO DE LISTAS Y CARPETAS ---

function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;

    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    let offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
    let search = document.getElementById('search-input')?.value.toLowerCase() || "";
    
    let filtered = [];
    if (currentFolder === "LISTA DE CANCIONES") {
        filtered = notes;
    } else {
        const ids = Object.keys(localAssignments).filter(id => localAssignments[id] === currentFolder);
        filtered = ids.map(id => offlineNotes[id]).filter(n => n != null);
    }

    const getPlainText = (html) => {
        const t = document.createElement("div");
        t.innerHTML = html || "";
        return t.textContent || t.innerText || "";
    };

    if (search) {
        filtered = filtered.filter(n => getPlainText(n.content).toLowerCase().includes(search));
    }

    filtered.sort((a, b) => getPlainText(a.content).localeCompare(getPlainText(b.content)));

    list.innerHTML = "";
    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; padding:20px;">No hay canciones</div>`;
        return;
    }

    // Agrupación Alfabética
    const groups = {};
    filtered.forEach(n => {
        const firstChar = getPlainText(n.content).trim()[0]?.toUpperCase() || "N";
        if (!groups[firstChar]) groups[firstChar] = [];
        groups[firstChar].push(n);
    });

    Object.keys(groups).sort().forEach(letter => {
        list.innerHTML += `<div class="alphabet-header">${letter}</div>`;
        groups[letter].forEach(note => {
            const lines = getPlainText(note.content).split('\n').filter(l => l.trim() !== "");
            list.innerHTML += `
                <div class="note-item" onclick="openNote('${note.id}')">
                    <span style="font-weight:600; display:block;">${lines[0] || "Nueva"}</span>
                    <span style="font-size:0.85rem; color:gray;">${lines[1] || "Ver nota..."}</span>
                </div>`;
        });
    });
}

function renderFolders() {
    const bar = document.getElementById('folder-bar');
    if (!bar) return;

    const privateFolders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    const localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    const all = [{ name: 'LISTA DE CANCIONES' }, ...privateFolders.map(n => ({ name: n }))];

    bar.innerHTML = all.map(f => {
        const isSelected = f.name === currentFolder;
        let count = (f.name === 'LISTA DE CANCIONES') 
            ? notes.length 
            : Object.values(localAssignments).filter(v => v === f.name).length;

        return `
            <div class="folder-chip ${isSelected ? 'active' : ''}">
                <span onclick="selectFolder('${f.name}')">${f.name} (${count})</span>
                ${f.name !== 'LISTA DE CANCIONES' ? `<button onclick="deleteFolder('${f.name}')">×</button>` : ''}
            </div>`;
    }).join('');
}

// --- 8. CARPETAS LOCALES Y PICKER ---

function addNewFolder() {
    const name = prompt("Nombre de la carpeta:");
    if (!name || name.toUpperCase() === "LISTA DE CANCIONES") return;
    
    let folders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    if (!folders.includes(name)) {
        folders.push(name);
        localStorage.setItem('myPrivateFolders', JSON.stringify(folders));
        renderFolders();
    }
}

function deleteFolder(name) {
    if (!confirm(`¿Borrar "${name}"?`)) return;
    let folders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    localStorage.setItem('myPrivateFolders', JSON.stringify(folders.filter(f => f !== name)));
    
    let assignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    for (let id in assignments) if (assignments[id] === name) delete assignments[id];
    localStorage.setItem('localFolderAssignments', JSON.stringify(assignments));
    
    selectFolder('LISTA DE CANCIONES');
}

function selectFolder(name) {
    currentFolder = name;
    renderFolders();
    renderNotes();
}

function openPicker() {
    const p = document.getElementById('folder-picker');
    if (p) { p.style.display = 'flex'; renderFolderPicker(); }
}

function closePicker() { document.getElementById('folder-picker').style.display = 'none'; }

function renderFolderPicker() {
    const container = document.getElementById('picker-list');
    const folders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    const assignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};

    if (folders.length === 0) {
        container.innerHTML = '<p style="padding:20px; color:gray;">Crea una carpeta primero</p>';
        return;
    }

    container.innerHTML = folders.map(f => {
        const isLinked = assignments[currentNoteId] === f;
        return `
            <div class="picker-item" onclick="toggleFolderLink('${f}')" style="padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                <span>${f}</span>
                <span>${isLinked ? '✓' : ''}</span>
            </div>`;
    }).join('');
}

function toggleFolderLink(folderName) {
    let assignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    if (assignments[currentNoteId] === folderName) {
        delete assignments[currentNoteId];
    } else {
        assignments[currentNoteId] = folderName;
        const note = findNoteById(currentNoteId);
        if (note) saveNoteLocally(note);
    }
    localStorage.setItem('localFolderAssignments', JSON.stringify(assignments));
    renderFolderPicker();
    renderFolders();
}

// --- 9. PERSISTENCIA Y SINCRONIZACIÓN ---

function saveNoteLocally(note) {
    let offline = JSON.parse(localStorage.getItem('offlineNotes')) || {};
    offline[note.id] = { id: note.id, content: note.content || "", updatedAt: Date.now() };
    localStorage.setItem('offlineNotes', JSON.stringify(offline));
}

async function removeNoteFromCurrentFolder() {
    if (!currentNoteId) return;
    const isMain = currentFolder === "LISTA DE CANCIONES";
    if (!confirm(isMain ? "¿BORRAR PERMANENTE DE LA NUBE?" : "¿Quitar de esta carpeta?")) return;

    if (isMain) {
        await notesCol.doc(currentNoteId).delete();
    } else {
        let assignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
        delete assignments[currentNoteId];
        localStorage.setItem('localFolderAssignments', JSON.stringify(assignments));
    }
    saveAndClose();
}
function undoText() {
    document.getElementById('note-textarea').focus();
    document.execCommand('undo', false, null);
    updateSongDisplay();
}
function saveAndClose() {
    // 1. Limpiamos el contenido visual para que no haya rastro al abrir otra nota
    const textarea = document.getElementById('note-textarea');
    const display = document.getElementById('song-display');
    
    if (textarea) textarea.innerHTML = "";
    if (display) display.innerHTML = "";

    // 2. Quitamos la clase active para que la pantalla baje (desaparezca)
    const editorView = document.getElementById('editor-view');
    if (editorView) editorView.classList.remove('active');

    // 3. Reseteamos el ID actual
    currentNoteId = null;

    // 4. Refrescamos la lista principal por si hubo cambios
    if (typeof renderNotes === "function") renderNotes();
}
// --- 10. INICIALIZACIÓN ---

window.onload = () => {
    // 1. ESCUCHA EN TIEMPO REAL DE FIREBASE
    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sincronizar localmente
        let offline = JSON.parse(localStorage.getItem('offlineNotes')) || {};
        notes.forEach(n => {
            // Solo actualizamos si la nota no existe localmente o es más nueva
            if (!offline[n.id] || n.updatedAt) { 
                offline[n.id] = { ...n };
            }
        });
        localStorage.setItem('offlineNotes', JSON.stringify(offline));

        renderFolders();
        renderNotes();
    }, error => {
        console.error("Error en Snapshot:", error);
    });

    // 2. BARRA DE FORMATO FLOTANTE (OPTIMIZADA MÓVIL)
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        const toolbar = document.getElementById('floating-toolbar');
        
        // Verificamos que haya selección y que el foco esté en el editor
        const isInsideEditor = sel.anchorNode && (sel.anchorNode.parentElement.id === 'note-textarea' || sel.anchorNode.id === 'note-textarea');

        if (toolbar && !sel.isCollapsed && sel.toString().trim() !== "" && isInsideEditor) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            toolbar.style.display = 'flex';
            
            const toolbarWidth = toolbar.offsetWidth;
            // Calculamos posición con scroll actual para evitar saltos en APK
            let left = rect.left + (rect.width / 2) - (toolbarWidth / 2);
            let top = rect.top + window.scrollY - 70; // Más espacio para no chocar

            // Límites de pantalla
            if (left < 10) left = 10;
            if (left + toolbarWidth > window.innerWidth) left = window.innerWidth - toolbarWidth - 10;
            // Si sale por arriba, la ponemos debajo de la selección
            if (top < 50) top = rect.bottom + window.scrollY + 10;

            toolbar.style.left = `${left}px`;
            toolbar.style.top = `${top}px`;
        } else if (toolbar) {
            // No ocultamos si el clic fue en la propia barra (para que funcionen los botones)
            if (!document.activeElement.closest('#floating-toolbar')) {
                toolbar.style.display = 'none';
            }
        }
    });

    // 3. EVENTOS DE TECLADO
    document.getElementById('pin-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyPin();
    });
};

// EXPOSICIÓN GLOBAL PARA HTML
Object.assign(window, {
    secureAction, verifyPin, closePinModal, exitEditMode, transpose,
    saveAndClose, openNote, applyFormat, undoText, createNewNote,
    addNewFolder, deleteFolder, selectFolder, openPicker, closePicker, 
    toggleFolderLink
});

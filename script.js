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


// 2. Variables de Estado
const scaleSharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleFlat  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
let useFlats = false;
let notes = [];
let folders = [];
let currentFolder = "LISTA DE CANCIONES";
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado con éxito'))
      .catch(err => console.warn('Fallo al registrar Service Worker', err));
  });
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

    // Regex de acordes (la tuya)
    const chordRegex = /(?<![a-zA-Z])([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus4|sus2|sus|add9|13|11|9|7|5|4|2|M)?(?![a-záéíóú])(?![A-Z])/g;

    display.innerHTML = text.split('\n').map(line => {
        // --- PASO 1: Formato de texto primero ---
        // Lo hacemos sobre el texto plano para no romper etiquetas HTML
        let formatted = line
            .replace(/\*(.*?)\*/g, '<b>$1</b>')   // *Negrita*
            .replace(/_(.*?)_/g, '<i>$1</i>')     // _Cursiva_
            .replace(/=(.*?)=/g, '<u>$1</u>');    // =Subrayado=

        // --- PASO 2: Resaltar acordes después ---
        // Ahora buscamos los acordes en el texto ya formateado
        formatted = formatted.replace(chordRegex, match => {
            return `<span class="chord-highlight">${match}</span>`;
        });

        // --- PASO 3: Retornar la línea ---
        return `<div>${formatted || '&nbsp;'}</div>`;
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
        // 1. Creamos la nota en Firebase con contenido VACÍO
        const newNoteRef = await notesCol.add({
            content: "", // Sin texto inicial para que no ensucie la base de datos
            folders: ["LISTA DE CANCIONES"], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentNoteId = newNoteRef.id;
        
        // 2. Referencia al textarea
        const textarea = document.getElementById('note-textarea');
        
        // 3. Ponemos el valor vacío y añadimos el Placeholder
        textarea.value = ""; 
        textarea.placeholder = "Escribe tu canción aquí..."; 
        
        updateSongDisplay();
        
        document.getElementById('editor-view').classList.add('active');
        document.getElementById('view-mode').style.display = 'none';
        document.getElementById('edit-mode').style.display = 'flex';
        
        setTimeout(() => {
            textarea.focus();
        }, 200);

    } catch (e) { 
        console.error("Error al crear:", e); 
        alert("No se pudo crear la nota en la nube.");
    }
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

// --- FUNCIONES DE CARPETAS Y OTROS ---

function addNewFolder() {
    const name = prompt("Nombre de la nueva carpeta privada:");
    if (!name) return;

    try {
        let privateFolders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];

        if (name.toUpperCase() === "LISTA DE CANCIONES") {
            alert("Nombre no permitido");
            return;
        }

        if (privateFolders.includes(name)) {
            alert("Esta carpeta ya existe");
            return;
        }

        privateFolders.push(name);
        localStorage.setItem('myPrivateFolders', JSON.stringify(privateFolders));

        // Forzamos el refresco de la interfaz
        if (typeof renderFolders === 'function') {
            renderFolders();
        }
    } catch (error) {
        console.error("Error local:", error);
        alert("Error al crear carpeta en este dispositivo.");
    }
}

function deleteFolder(folderName) {
    if (!confirm(`¿Borrar carpeta local "${folderName}"?`)) return;

    let privateFolders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    privateFolders = privateFolders.filter(f => f !== folderName);
    localStorage.setItem('myPrivateFolders', JSON.stringify(privateFolders));

    // También limpiamos las asignaciones de notas en esa carpeta
    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    for (let id in localAssignments) {
        if (localAssignments[id] === folderName) delete localAssignments[id];
    }
    localStorage.setItem('localFolderAssignments', JSON.stringify(localAssignments));

    renderFolders();
    selectFolder('LISTA DE CANCIONES');
}

function selectFolder(name) {
    currentFolder = name;
    
    if (name === 'LISTA DE CANCIONES') {
        // Modo Nube: Usa los datos de Firebase
        renderNotes(notes); 
    } else {
        // Modo Offline: Filtra las notas guardadas en el teléfono
        let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
        let offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
        
        // Buscamos qué notas pertenecen a esta carpeta local
        let filteredIds = Object.keys(localAssignments).filter(id => localAssignments[id] === name);
        let folderNotes = filteredIds.map(id => offlineNotes[id]).filter(n => n !== undefined);
        
        renderNotes(folderNotes);
    }
    renderFolders();
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

    // LEER SOLO DEL TELÉFONO
    let privateFolders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};

    // Si el array está vacío, mostrar mensaje
    if (privateFolders.length === 0) {
        container.innerHTML = '<p style="padding:20px; color:gray;">Crea una carpeta primero</p>';
        return;
    }

    container.innerHTML = privateFolders.map(folderName => {
        const isLinked = localAssignments[currentNoteId] === folderName;
        return `
            <div class="picker-item" onclick="toggleFolderLink('${folderName}')" style="display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid #eee;">
                <span>${folderName}</span>
                <span style="color:var(--folder-accent); font-weight:bold;">${isLinked ? '✓' : ''}</span>
            </div>`;
    }).join('');
}
async function saveAndClose() {
    const textarea = document.getElementById('note-textarea');
    const content = (textarea.value || "").trim();
    const editorView = document.getElementById('editor-view');

    // 1. REGRESAR A LA PANTALLA PRINCIPAL DE INMEDIATO
    // Quitamos la clase 'active' primero para que el usuario vea que la app responde
    if (editorView) {
        editorView.classList.remove('active');
    }

    // 2. Lógica de borrado (Sin await para no congelar)
    if (currentNoteId && content === "") {
        // Firebase se encarga de esto en segundo plano
        notesCol.doc(currentNoteId).delete()
            .catch(e => console.log("Borrado pendiente de conexión"));
            
    } else if (currentNoteId) {
        // 3. Restaurar original (Localmente es instantáneo, no necesita await)
        const originalNote = notes.find(n => n.id === currentNoteId);
        if (originalNote) {
            textarea.value = originalNote.content;
            updateSongDisplay();
        }
    }

    // 4. Limpieza de interfaz (con un pequeño delay para la animación)
    setTimeout(() => {
        document.getElementById('view-mode').style.display = 'flex';
        document.getElementById('edit-mode').style.display = 'none';

        currentNoteId = null;
        if (textarea) textarea.placeholder = ""; 
        
        renderNotes(); 
    }, 300);
}
async function exitEditMode() {
    const textarea = document.getElementById('note-textarea');
    const newContent = textarea.value.trim();

    if (!currentNoteId) return;

    // CASO A: Si la nota está VACÍA
    if (newContent === "") {
        // Cerramos el panel completo de inmediato
        document.getElementById('editor-view').classList.remove('active');
        
        // Ordenamos el borrado sin 'await'
        notesCol.doc(currentNoteId).delete()
            .catch(e => console.log("Se borrará cuando haya internet"));
        
        setTimeout(() => {
            currentNoteId = null;
            renderNotes();
        }, 300);
        return; 
    }

    // CASO B: Si tiene contenido, guardamos en segundo plano y pasamos al VISOR
    // No usamos 'await' aquí para que el cambio de pantalla sea instantáneo
    notesCol.doc(currentNoteId).update({
        content: textarea.value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.log("Guardado localmente, sincronizando..."));

    // Actualizamos la variable local para que el visor muestre el cambio ya mismo
    const note = notes.find(n => n.id === currentNoteId);
    if (note) note.content = textarea.value;

    updateSongDisplay();
    
    // Cambiamos al modo visor sin esperas
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('view-mode').style.display = 'flex';
}
function parseMarkdown(text) {
    return text
        // Negritas: *texto* -> <b>texto</b>
        .replace(/\*(.*?)\*/g, '<b>$1</b>')
        // Cursivas: _texto_ -> <i>texto</i>
        .replace(/_(.*?)_/g, '<i>$1</i>')
        // Tachado: ~texto~ -> <del>$1</del>
        .replace(/~(.*?)~/g, '<del>$1</del>');
}
function toggleFolderLink(folderName) {
    if (!currentNoteId) return;
    
    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    
    // Si ya estaba en esta carpeta, la quitamos (Toggle)
    if (localAssignments[currentNoteId] === folderName) {
        delete localAssignments[currentNoteId];
        console.log("Nota quitada de la carpeta local");
    } else {
        // La asignamos a la carpeta
        localAssignments[currentNoteId] = folderName;
        
        // BUSCAR LA NOTA PARA COPIARLA OFFLINE
        const noteToCopy = notes.find(n => n.id === currentNoteId);
        if (noteToCopy) {
            saveNoteLocally(noteToCopy); // Aquí se crea la copia física
        }
    }

    localStorage.setItem('localFolderAssignments', JSON.stringify(localAssignments));
    
    renderFolderPicker(); // Actualiza los checks (círculos)
    renderFolders();      // Actualiza los contadores en la barra naranja
}

async function removeNoteFromCurrentFolder() {
    if (!currentNoteId) return;

    const mensaje = currentFolder === "LISTA DE CANCIONES" 
        ? "¿Eliminar esta canción permanentemente para TODOS?" 
        : `¿Quitar de mi carpeta privada "${currentFolder}"?`;

    if (confirm(mensaje)) {
        try {
            if (currentFolder === "LISTA DE CANCIONES") {
                // 1. BORRADO TOTAL DE LA NUBE (Compartido)
                await notesCol.doc(currentNoteId).delete();
            } else {
                // 2. SOLO QUITAR DE CARPETA LOCAL (Privado del teléfono)
                // En lugar de update en Firebase, borramos la asignación local
                let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
                
                if (localAssignments[currentNoteId]) {
                    delete localAssignments[currentNoteId];
                    localStorage.setItem('localFolderAssignments', JSON.stringify(localAssignments));
                }
                console.log("Nota quitada de la carpeta localmente.");
            }

            // Cerrar editor y limpiar
            document.getElementById('editor-view').classList.remove('active');
            setTimeout(() => { currentNoteId = null; }, 500);
            
            // Refrescar para ver los cambios
            renderFolders();
            renderNotes();

        } catch (e) {
            console.error("Error:", e);
            alert("Error al procesar la solicitud.");
        }
    }
}
function renderFolders() {
    const bar = document.getElementById('folder-bar');
    if (!bar) return;

    // 1. Cargamos lo que hay en el teléfono
    const privateFolders = JSON.parse(localStorage.getItem('myPrivateFolders')) || [];
    const localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    const offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};

    // 2. Creamos la lista combinada: Principal + Tus carpetas
    const allFolders = [{ name: 'LISTA DE CANCIONES' }, ...privateFolders.map(name => ({ name }))];

    bar.innerHTML = allFolders.map(f => {
        const isSelected = f.name === currentFolder;
        
        let count = 0;
        if (f.name === 'LISTA DE CANCIONES') {
            // Cuenta todo lo que viene de Firebase
            count = notes.length;
        } else {
            // Cuenta solo los IDs asignados a esta carpeta en el teléfono
            count = Object.values(localAssignments).filter(folderName => folderName === f.name).length;
        }

        return `
            <div class="folder-chip ${isSelected ? 'active' : ''}">
                <span onclick="selectFolder('${f.name}')" style="cursor:pointer;">
                    ${f.name} <span class="folder-count">(${count})</span>
                </span>
                ${f.name !== 'LISTA DE CANCIONES' ? `
                    <button onclick="deleteFolder('${f.name}')" style="background:none; border:none; margin-left:8px; cursor:pointer; color:inherit;">
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

    // 1. CARGAR DATOS LOCALES
    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    let offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
    let searchQuery = document.getElementById('search-input')?.value.toLowerCase() || "";

    let filtered = [];

    // 2. DECIDIR DE DÓNDE SACAR LAS NOTAS
    if (currentFolder === "LISTA DE CANCIONES") {
        // MODO NUBE: Usar la variable 'notes' de Firebase
        filtered = notes;
    } else {
        // MODO LOCAL: Filtrar las que el usuario movió a esta carpeta específica
        const idsInFolder = Object.keys(localAssignments).filter(id => localAssignments[id] === currentFolder);
        filtered = idsInFolder.map(id => offlineNotes[id]).filter(n => n != null);
    }

    // 3. APLICAR BUSCADOR (Si hay texto en el input de búsqueda)
    if (searchQuery) {
        filtered = filtered.filter(n => (n.content || "").toLowerCase().includes(searchQuery));
    }

    // 4. ORDENAR ALFABÉTICAMENTE
    filtered.sort((a, b) => (a.content || "").localeCompare(b.content || ""));

    // 5. RENDERIZAR (Dibujar en pantalla)
    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; margin-top:2rem;">No hay canciones aquí</div>`;
        return;
    }

    // Agrupar por letra (A, B, C...)
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

// Función para guardar una copia local
function saveNoteLocally(note) {
    if (!note || !note.id) return;

    let localNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
    
    // Guardamos una copia limpia
    localNotes[note.id] = {
        id: note.id,
        content: note.content || "",
        // Convertimos el timestamp de Firebase a milisegundos para poder comparar luego
        updatedAt: note.updatedAt && note.updatedAt.toMillis ? note.updatedAt.toMillis() : Date.now()
    };
    
    localStorage.setItem('offlineNotes', JSON.stringify(localNotes));
    console.log(`Nota "${note.id}" guardada para uso offline.`);
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
   

    // 2. Mantenemos solo UNA conexión a las notas
    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // --- SINCRONIZACIÓN AUTOMÁTICA OFFLINE ---
        let offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
        let changed = false;

        notes.forEach(cloudNote => {
            if (offlineNotes[cloudNote.id]) {
                // Si el contenido cambió en la nube, actualizamos la copia local
                if (cloudNote.content !== offlineNotes[cloudNote.id].content) {
                    offlineNotes[cloudNote.id].content = cloudNote.content;
                    changed = true;
                    console.log("Sincronizado cambio de nube a copia local: " + cloudNote.id);
                }
            }
        });

        if (changed) {
            localStorage.setItem('offlineNotes', JSON.stringify(offlineNotes));
        }
        
        // Refrescamos la interfaz
        renderFolders();
        renderNotes(); // Esta función ahora ya sabe decidir si usa 'notes' o 'offlineNotes'
    });
    
    // Escuchar Enter en el PIN (Recuerda que tu código es 019283 según tus notas)
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
window.saveNoteLocally = saveNoteLocally;
window.renderFolderPicker = renderFolderPicker;

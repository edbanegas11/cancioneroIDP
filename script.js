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

firebase.firestore().enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.warn("Persistencia falló: múltiples pestañas abiertas");
      } else if (err.code == 'unimplemented') {
          console.warn("El navegador no soporta persistencia");
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
let currentFontSize = 16; // Tamaño base que ya tienes

function adjustZoom(amount) {
    currentFontSize += amount;
    
    // Ponemos un límite mínimo para que no desaparezca la letra (ej. 8px)
    if (currentFontSize < 8) currentFontSize = 8;
    // Y un límite máximo
    if (currentFontSize > 30) currentFontSize = 30;
;
    const editor = document.getElementById('note-textarea');
    const visor = document.getElementById('song-display');

    // Aplicamos el nuevo tamaño a ambos para mantener la simetría
    if (editor) editor.style.fontSize = currentFontSize + 'px';
    if (visor) visor.style.fontSize = currentFontSize + 'px';
}
function closePinModal() {
    document.getElementById('pin-modal').style.display = 'none';
}

// --- FUNCIONES DE VISUALIZACIÓN ---
function stripMarkdown(text) {
    if (!text) return "";
    return text
        .replace(/\*/g, '') // Quita todos los asteriscos
        .replace(/_/g, '')  // Quita todos los guiones bajos
        .replace(/=/g, '')  // Quita los signos de igual
        .replace(/~|\[|\]/g, ''); // Opcional: Quita corchetes de acordes y tachados
}

function getCleanText(text) {
    if (!text) return "";
    // Quitamos asteriscos, guiones bajos, signos de igual y corchetes
    return text.replace(/[*_=\[\]]/g, '').trim();
}

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
    if (!textarea) return;

    let text = textarea.value;
    const scaleSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scaleFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const useFlats = /\b[A-G]b\b|\b[A-G]b(m|7|maj)/.test(text);
    const chordRegex = /\b([A-G][#b]?)(m|maj7|maj|min|dim|aug|sus\d?|add\d?|7|9|11|13|5|M|b5)?(?![a-zñóáéíú])/g;

    const lines = text.split('\n');
    const newLines = lines.map(line => {
        let newLine = line;
        let match;
        let diffAccumulated = 0; // Rastreamos cuánto se ha movido la línea

        // Usamos un array de matches para procesarlos de atrás hacia adelante
        // o con un índice corregido para no perder la posición.
        const matches = Array.from(line.matchAll(chordRegex));
        
        // Procesamos de derecha a izquierda para que los cambios de posición 
        // no afecten a los acordes que aún no hemos procesado.
        for (let i = matches.length - 1; i >= 0; i--) {
            match = matches[i];
            let originalChord = match[0];
            let baseNote = match[1];
            let suffix = match[2] || "";
            let index = match.index;

            // Calculamos nuevo acorde
            let scaleIndex = scaleSharp.indexOf(baseNote);
            if (scaleIndex === -1) scaleIndex = scaleFlat.indexOf(baseNote);
            if (scaleIndex === -1) continue;

            let newScaleIndex = (scaleIndex + semitones + 12) % 12;
            let newBaseNote = useFlats ? scaleFlat[newScaleIndex] : scaleSharp[newScaleIndex];
            let newChord = newBaseNote + suffix;

            let diff = originalChord.length - newChord.length;

            // Cortamos y pegamos la línea con el nuevo acorde
            let before = newLine.substring(0, index);
            let after = newLine.substring(index + originalChord.length);

            if (diff < 0) {
                // El acorde CRECIÓ (C -> C#). Si hay un espacio después, lo quitamos.
                if (after.startsWith(" ")) {
                    after = after.substring(1);
                }
            } else if (diff > 0) {
                // El acorde SE ACHICÓ (C# -> D). Añadimos un espacio.
                after = " " + after;
            }

            newLine = before + newChord + after;
        }
        return newLine;
    });

    textarea.value = newLines.join('\n');
    updateSongDisplay();
}

async function createNewNote() {
    try {
        // --- CONTROL DEL BOTÓN ---
        // Lo ocultamos inmediatamente para que solo exista en la principal
        const btnNew = document.querySelector('.btn-new');
        if (btnNew) btnNew.style.display = 'none';

        // 1. Creamos la nota en Firebase
        const newNoteRef = await notesCol.add({
            content: "", 
            folders: ["LISTA DE CANCIONES"], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentNoteId = newNoteRef.id;
        
        const textarea = document.getElementById('note-textarea');
        textarea.value = ""; 
        textarea.placeholder = "Escribe tu canción aquí..."; 
        
        updateSongDisplay();
        
        // 2. Cambio de vista
        document.getElementById('editor-view').classList.add('active');
        document.getElementById('view-mode').style.display = 'none'; // Al crear, vamos directo a editar
        document.getElementById('edit-mode').style.display = 'flex';
        
        // 3. Foco automático mejorado para móviles
        setTimeout(() => {
            textarea.focus();
            // Truco: Scroll al inicio para evitar que el teclado mueva el layout de forma errática
            window.scrollTo(0, 0);
        }, 300);

    } catch (e) { 
        console.error("Error al crear:", e); 
        // Si falla, volvemos a mostrar el botón
        const btnNew = document.querySelector('.btn-new');
        if (btnNew) btnNew.style.display = 'flex';
        alert("No se pudo crear la nota en la nube.");
    }
}

function openNote(id) {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    // Usar siempre el ID para evitar confusiones
    const btnNew = document.getElementById('btn-floating-main');
    if (btnNew) btnNew.style.display = 'none';

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
    const editorView = document.getElementById('editor-view');

    if (editorView) {
        editorView.classList.remove('active');
    }

    // 1. Mostrar botón usando el ID único
    const btnNew = document.getElementById('btn-floating-main');
    if (btnNew) btnNew.style.display = 'flex'; 

    setTimeout(() => {
        document.getElementById('view-mode').style.display = 'flex';
        document.getElementById('edit-mode').style.display = 'none';
        // BORRA ESTA LÍNEA QUE TENÍAS: document.getElementById('btn-floating-main').style.display = 'none';
        currentNoteId = null;
        renderNotes(); 
    }, 300);
}

async function exitEditMode() {
    const textarea = document.getElementById('note-textarea');
    const newContent = textarea.value.trim();

    if (!currentNoteId) return;
    
    const btn = document.getElementById('btn-floating-main');
    if (btn) btn.style.display = 'none';
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
    document.getElementById('btn-floating-main').style.display = 'none';

    // 3. Opcional: Ajustar altura del textarea automáticamente
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    
    // 4. Inicializar iconos de Lucide (por el botón de deshacer)
    if (window.lucide) lucide.createIcons();
}

function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;

    let localAssignments = JSON.parse(localStorage.getItem('localFolderAssignments')) || {};
    let offlineNotes = JSON.parse(localStorage.getItem('offlineNotes')) || {};
    let searchQuery = document.getElementById('search-input')?.value.toLowerCase() || "";

    let filtered = [];

    if (currentFolder === "LISTA DE CANCIONES") {
        filtered = notes;
    } else {
        const idsInFolder = Object.keys(localAssignments).filter(id => localAssignments[id] === currentFolder);
        filtered = idsInFolder.map(id => offlineNotes[id]).filter(n => n != null);
    }

    // --- CAMBIO 1: BÚSQUEDA INTELIGENTE ---
    // Buscamos sobre el texto limpio para que si buscas "Amor" encuentre "*Amor*"
    if (searchQuery) {
        filtered = filtered.filter(n => getCleanText(n.content).toLowerCase().includes(searchQuery));
    }

    // --- CAMBIO 2: ORDEN ALFABÉTICO SIN SÍMBOLOS ---
    filtered.sort((a, b) => {
        const textA = getCleanText(a.content).toLowerCase();
        const textB = getCleanText(b.content).toLowerCase();
        return textA.localeCompare(textB);
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; margin-top:2rem;">No hay canciones aquí</div>`;
        return;
    }

    // --- CAMBIO 3: AGRUPAR POR LETRA REAL ---
    const groups = {};
    filtered.forEach(n => {
        const cleanContent = getCleanText(n.content);
        // Usamos la primera letra del texto LIMPIO
        const char = cleanContent ? cleanContent[0].toUpperCase() : "N";
        if (!groups[char]) groups[char] = [];
        groups[char].push(n);
    });

    list.innerHTML = "";
    Object.keys(groups).sort().forEach(letter => {
        list.innerHTML += `<div class="alphabet-header">${letter}</div>`;
        groups[letter].forEach(note => {
            // --- CAMBIO 4: LIMPIAR EL TÍTULO Y SUBTÍTULO VISUAL ---
            // Filtramos las líneas para quedarnos solo con las que tienen texto real
const allLines = getCleanText(note.content).split('\n').map(l => l.trim()).filter(l => l !== "");

const title = allLines[0] || "Nueva canción";
// Ahora el subtítulo será la siguiente línea con texto, saltando cualquier espacio vacío
const subtitle = allLines[1] || "Ver canción...";

            list.innerHTML += `
                <div class="note-item" onclick="openNote('${note.id}')">
                    <span style="font-weight:600; display:block;">${title}</span>
                    <span style="font-size:0.85rem; color:gray;">${subtitle}</span>
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
    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
      // FORZAR QUE EL BOTÓN APAREZCA AL CARGAR LA APP
    const btnNew = document.querySelector('.btn-new');
    if (btnNew) btnNew.style.display = 'flex';
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

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

firebase.firestore().enablePersistence().catch((err) => {
    console.log('Error de persistencia:', err.code);
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

// --- FUNCIONES DE NOTAS ---

function transpose(semitones) {
    const textarea = document.getElementById('note-textarea');
    if (!textarea) return;

    let text = textarea.value;
    
    if (text.includes('b')) useFlats = true;
    else if (text.includes('#')) useFlats = false;

    // La Regex ahora busca:
    // (?<![a-zA-Z]) -> Que NO tenga una letra antes
    // ([A-G]) -> La nota base
    // ([#b]*) -> Los accidentes
    // (...) -> El tipo de acorde
    // (?![a-zA-Z]) -> Que NO tenga una letra después (esto salva a "Grande")
    const chordRegex = /(?<![a-zA-Z])([A-G])([#b]*)(m|maj7|maj|dim|aug|sus4|sus|add9|7|2|4|5|M)?(?![a-zA-Z])/g;

    const newText = text.replace(chordRegex, (fullMatch, letter, accidentals, suffix) => {
        // Solo procesamos si es una nota real con su primer accidente
        let baseNote = letter + (accidentals.length > 0 ? accidentals[0] : "");
        
        let index = scaleSharp.indexOf(baseNote);
        if (index === -1) index = scaleFlat.indexOf(baseNote);
        
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
        const newNoteRef = await notesCol.add({
            content: "", 
            folders: ["Notas"], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentNoteId = newNoteRef.id;
        const editor = document.getElementById('editor-view');
        const textarea = document.getElementById('note-textarea');
        if (editor && textarea) {
            textarea.value = "";
            editor.classList.add('active');
            renderFolderPicker();
            setTimeout(() => textarea.focus(), 300);
        }
    } catch (e) { console.error("Error al crear:", e); }
}

function openNote(id) {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const textarea = document.getElementById('note-textarea');
    textarea.value = note.content;
    const viewer = document.getElementById('note-viewer'); 
    if (viewer) viewer.innerHTML = formatMusicalText(note.content);
    renderFolderPicker();
    document.getElementById('editor-view').classList.add('active');
    setTimeout(() => textarea.focus(), 300);
}

function formatMusicalText(text) {
    if (!text) return "";
    
    // Regex que protege las palabras y detecta acordes
    const chordRegex = /(?<![a-zA-Z])([A-G])([#b]*)(m|maj7|maj|dim|aug|sus4|sus|add9|7|2|4|5|M)?(?![a-zA-Z])/g;

    return text.split('\n').map(line => {
        let hasChords = false;
        const highlightedLine = line.replace(chordRegex, match => {
            hasChords = true;
            return `<span class="chord-highlight">${match}</span>`;
        });
        
        // Si la línea tiene acordes, le damos un estilo especial
        return `<div class="${hasChords ? 'music-line' : 'plain-line'}">${highlightedLine}</div>`;
    }).join('\n');
}

async function saveAndClose() {
    try {
        const txt = document.getElementById('note-textarea').value;
        if (currentNoteId) {
            await notesCol.doc(currentNoteId).update({ 
                content: txt,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        document.getElementById('editor-view').classList.remove('active');
    } catch (e) { console.error("Error al guardar:", e); }
}

// --- FUNCIONES DE CARPETAS ---

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

// --- LÓGICA DE VINCULACIÓN (PICKER) ---

function openPicker() {
    const picker = document.getElementById('folder-picker');
    if (picker) {
        picker.style.display = 'flex';
        picker.classList.add('active');
        renderFolderPicker();
    }
}

function closePicker() { 
    document.getElementById('folder-picker').style.display = 'none'; 
}

function renderFolderPicker() {
    const container = document.getElementById('picker-list');
    if (!container || !currentNoteId) return;
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    container.innerHTML = folders.map(f => {
        const folderName = (typeof f === 'object') ? f.name : f;
        const isLinked = note.folders && note.folders.includes(folderName);
        return `
            <div class="picker-item" onclick="toggleFolderLink('${folderName}')" 
                 style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #eee; cursor:pointer;">
                <span style="color:#333; font-weight:500;">${folderName}</span>
                <span style="color:#007aff; font-weight:bold; font-size:1.2rem;">
                    ${isLinked ? '✓' : ''}
                </span>
            </div>`;
    }).join('');
}

async function toggleFolderLink(folderName) {
    if (!currentNoteId) return;
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    const isLinked = note.folders && note.folders.includes(folderName);
    const noteRef = notesCol.doc(currentNoteId);

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

// --- ELIMINACIÓN Y DESVINCULACIÓN ---

async function removeNoteFromCurrentFolder() {
    if (!currentNoteId) return;
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;

    try {
        if (currentFolder === "Notas") {
            if (confirm("¿Deseas eliminar esta nota permanentemente?")) {
                await notesCol.doc(currentNoteId).delete();
                document.getElementById('editor-view').classList.remove('active');
            }
        } else {
            if (confirm(`¿Quitar de la carpeta "${currentFolder}"?`)) {
                await notesCol.doc(currentNoteId).update({
                    folders: firebase.firestore.FieldValue.arrayRemove(currentFolder)
                });
                document.getElementById('editor-view').classList.remove('active');
            }
        }
    } catch (e) { console.error(e); }
}

// --- RENDERIZADO PRINCIPAL ---

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
                <div class="note-item ${note.id === currentNoteId ? 'active-note' : ''}" onclick="openNote('${note.id}')">
                    <span style="font-weight:600; display:block;">${lines[0] || "Nueva nota"}</span>
                    <span style="font-size:0.85rem; color:gray;">${lines[1] || "Ver nota..."}</span>
                </div>`;
        });
    });
}

function handleSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        searchQuery = input.value.toLowerCase();
        renderNotes();
    }
}

// --- CONEXIÓN REAL-TIME ---

window.onload = () => {
    foldersCol.orderBy('name').onSnapshot(snap => {
        const fbFolders = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })).filter(f => f.name !== "Notas");
        folders = [{ id: 'default', name: 'Notas' }, ...fbFolders];
        renderFolders();
        renderFolderPicker();
    });

    notesCol.onSnapshot(snap => {
        notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNotes();
        renderFolders();
        renderFolderPicker();
    });
};

// --- EXPORTACIÓN ---
window.handleSearch = handleSearch;
window.selectFolder = selectFolder;
window.renderFolderPicker = renderFolderPicker;
window.renderNotes = renderNotes;
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

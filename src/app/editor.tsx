import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator, Modal 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library'; 
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { transcribeHandwriting, transcribeFormulaSnippet } from '../core/services/gemini'; 
import { saveProject, getProject, ExamProject, Section, Question, checkScanEligibility, deductScanToken, purchaseTokens, getAppSettings } from '../core/services/storage'; 
import { generateExamHtml } from '../core/services/pdf';

// --- HELPERS ---
const LAYOUT_CYCLE: Record<string, '1-column' | '2-column' | '3-column'> = {
  '1-column': '2-column',
  '2-column': '3-column',
  '3-column': '1-column',
};
const LAYOUT_LABEL: Record<string, string> = {
  '1-column': '1 Col',
  '2-column': '2 Col',
  '3-column': '3 Col',
};

// --- SUB-COMPONENTS ---
const HeaderEditor = memo(({ header, onChange }: { header: any, onChange: (h: any) => void }) => (
  <View style={styles.headerCard}>
    <TextInput style={styles.schoolInput} value={header.schoolName} onChangeText={t => onChange({...header, schoolName: t})} placeholder="SCHOOL NAME" />
    <TextInput style={styles.titleInput} value={header.title} onChangeText={t => onChange({...header, title: t})} placeholder="EXAM TITLE" />
    <TextInput style={styles.classInput} value={header.className} onChangeText={t => onChange({...header, className: t})} placeholder="Subject / Class (e.g., Physics XII-A)" />
    <View style={styles.metaRow}>
      <View style={styles.metaBox}><Text style={styles.label}>DURATION</Text><TextInput style={styles.metaInput} value={header.duration} onChangeText={t => onChange({...header, duration: t})} /></View>
      <View style={styles.metaBox}><Text style={styles.label}>MARKS</Text><TextInput style={styles.metaInput} value={header.totalMarks} onChangeText={t => onChange({...header, totalMarks: t})} /></View>
    </View>
    <View style={styles.instructionBox}><Text style={styles.label}>INSTRUCTIONS</Text><TextInput style={styles.instInput} value={header.instructions} onChangeText={t => onChange({...header, instructions: t})} multiline /></View>
  </View>
));

const QuestionCard = memo(({ 
  item, sectionId, allSections, onUpdate, onDelete, onMove, onPickDiagram, onMoveToSection,
  isSelectMode, isSelected, onToggleSelect
}: { 
  item: Question, sectionId: string, 
  allSections: { id: string; title: string }[],
  onUpdate: (sId: string, qId: string, field: keyof Question, val: any) => void,
  onDelete: (sId: string, qId: string) => void,
  onMove: (sId: string, idx: number, dir: 'up' | 'down') => void,
  onPickDiagram: (sId: string, qId: string) => void,
  onMoveToSection: (fromSecId: string, qId: string, toSecId: string) => void,
  isSelectMode: boolean, isSelected: boolean, onToggleSelect: (qId: string) => void
}) => {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showSnippetMenu, setShowSnippetMenu] = useState(false);
  const [isSnipping, setIsSnipping] = useState(false);
  
  // NEW: Track the cursor position!
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  // NEW: The formatting injector
  const applyFormatting = (prefix: string, suffix: string, defaultText: string = '') => {
    const currentText = item.text || '';
    const { start, end } = selection;
    
    let newText = '';
    if (start !== end) {
      // If the user highlighted a word, wrap it!
      const selectedText = currentText.substring(start, end);
      newText = currentText.substring(0, start) + prefix + selectedText + suffix + currentText.substring(end);
    } else {
      // If no word is highlighted, insert at the blinking cursor!
      newText = currentText.substring(0, start) + prefix + defaultText + suffix + currentText.substring(start);
    }
    
    onUpdate(sectionId, item.id, 'text', newText);
  };  

  const updateOption = (idx: number, text: string) => {
    const newOptions = [...(item.options || ["", "", "", ""])];
    newOptions[idx] = text;
    onUpdate(sectionId, item.id, 'options', newOptions);
  };

  // Helper to handle the image once it's picked
  const processSnippet = async (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets[0]) {
      setIsSnipping(true);
      try {
        const formulaText = await transcribeFormulaSnippet(result.assets[0].uri);
        if (formulaText) {
          const newText = item.text ? `${item.text} ${formulaText}` : formulaText;
          onUpdate(sectionId, item.id, 'text', newText);
        } else {
          Alert.alert("Failed", "Could not read the formula.");
        }
      } catch (e) {
        Alert.alert("Error", "Failed to process snippet");
      } finally {
        setIsSnipping(false);
      }
    }
  };


  const otherSections = allSections.filter(s => s.id !== sectionId);
  const currentSize = item.diagramSize || 'M';
  const isInstruction = item.type === 'instruction';

  return (
    // CRITICAL FIX: Changed from TouchableOpacity back to View to stop it from breaking TextInputs
    <View style={[styles.qCard, isSelected && styles.qCardSelected]}>
      <View style={styles.qHeader}>
        <View style={{flexDirection:'row', alignItems:'center', gap: 12}}>
          {isSelectMode && (
            <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#2563EB" : "#9CA3AF"} />
          )}
          {!isInstruction && (
            <View style={styles.numTag}>
              <TextInput style={styles.numInput} value={item.number} onChangeText={t => onUpdate(sectionId, item.id, 'number', t)} placeholder="#" placeholderTextColor="#888" editable={!isSelectMode} />
            </View>
          )}
          {/* THE TRIGGER BADGE */}
          <TouchableOpacity 
            onPress={() => setShowTypeMenu(true)} 
            disabled={isSelectMode} 
            style={[
              styles.typeBadge, 
              item.type === 'mcq' ? styles.typeBadgeMCQ : isInstruction ? styles.typeBadgeInstr : {},
              { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }
            ]}
          >
            <Text style={[styles.typeText, (item.type === 'mcq' || isInstruction) && {color:'white'}]}>
              {isInstruction ? 'INSTR' : item.type === 'mcq' ? 'MCQ' : 'TEXT'}
            </Text>
            <Ionicons 
              name="chevron-down" 
              size={12} 
              color={(item.type === 'mcq' || isInstruction) ? 'white' : '#2563EB'} 
            />
          </TouchableOpacity>
        </View>

        {!isSelectMode && (
          <View style={styles.toolRow}>
            <TouchableOpacity onPress={() => onMove(sectionId, parseInt(item.number)-1, 'up')} style={styles.toolBtn}><Ionicons name="arrow-up" size={16} color="#555" /></TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(sectionId, parseInt(item.number)-1, 'down')} style={styles.toolBtn}><Ionicons name="arrow-down" size={16} color="#555" /></TouchableOpacity>
            {otherSections.length > 0 && (
              <TouchableOpacity onPress={() => setShowMoveMenu(true)} style={[styles.toolBtn, {backgroundColor:'#EFF6FF'}]}><Ionicons name="swap-horizontal" size={16} color="#2563EB" /></TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onDelete(sectionId, item.id)} style={[styles.toolBtn, {backgroundColor:'#fee2e2'}]}><Ionicons name="trash" size={16} color="#dc2626" /></TouchableOpacity>
          </View>
        )}
      </View>

      <View style={{ position: 'relative' }}>
        <TextInput 
          style={[styles.qInput, item.hideText && styles.dimmedInput, isInstruction && styles.instructionInput, { paddingRight: 40 }]} 
          value={item.text} 
          onChangeText={t => onUpdate(sectionId, item.id, 'text', t)} 
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)} // Tracks the cursor!
          multiline 
          editable={!item.hideText && !isSelectMode} 
          placeholder={isInstruction ? "Enter subheading or instruction..." : "Question text..."} 
        />
        
        {/* THE SNIPPET BUTTON (Moved to top-right so it stays out of the way) */}
        {!isInstruction && !item.hideText && !isSelectMode && (
          <TouchableOpacity 
            style={{ position: 'absolute', right: 5, top: 5, backgroundColor: '#EFF6FF', padding: 6, borderRadius: 8 }}
            onPress={() => setShowSnippetMenu(true)}
            disabled={isSnipping}
          >
            {isSnipping ? <ActivityIndicator size="small" color="#2563EB" /> : <Ionicons name="camera" size={18} color="#2563EB" />}
          </TouchableOpacity>
        )}
      </View>

      {/* THE QUICK FORMAT TOOLBAR */}
      {!item.hideText && !isSelectMode && (
        <View style={styles.formatToolbar}>
          <TouchableOpacity style={styles.formatBtn} onPress={() => applyFormatting('**', '**', 'bold')}>
            <Text style={[styles.formatBtnText, {fontWeight: 'bold'}]}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.formatBtn} onPress={() => applyFormatting('*', '*', 'italic')}>
            <Text style={[styles.formatBtnText, {fontStyle: 'italic'}]}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.formatBtn} onPress={() => applyFormatting('_______________', '')}>
            <Text style={styles.formatBtnText}>___</Text>
          </TouchableOpacity>
          {!isInstruction && (
            <TouchableOpacity style={styles.formatBtn} onPress={() => applyFormatting('$\\ce{', '}$', 'H2O')}>
              <Text style={styles.formatBtnText}>\ce{ }</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      
      {item.type === 'mcq' && !item.hideText && !isInstruction && (
        <View style={styles.mcqContainer}>
          <View style={styles.mcqRow}>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>A</Text><TextInput style={styles.mcqInput} placeholder="Option A" value={item.options?.[0]} onChangeText={t => updateOption(0, t)} editable={!isSelectMode}/></View>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>B</Text><TextInput style={styles.mcqInput} placeholder="Option B" value={item.options?.[1]} onChangeText={t => updateOption(1, t)} editable={!isSelectMode}/></View>
          </View>
          <View style={styles.mcqRow}>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>C</Text><TextInput style={styles.mcqInput} placeholder="Option C" value={item.options?.[2]} onChangeText={t => updateOption(2, t)} editable={!isSelectMode}/></View>
            <View style={styles.mcqOption}><Text style={styles.mcqLabel}>D</Text><TextInput style={styles.mcqInput} placeholder="Option D" value={item.options?.[3]} onChangeText={t => updateOption(3, t)} editable={!isSelectMode}/></View>
          </View>
        </View>
      )}

      {/* DIAGRAM AREA */}
      {(!isInstruction) && (
        (!item.diagramUri || item.diagramUri === "NEEDS_CROP" ? (
          <TouchableOpacity 
            onPress={() => !isSelectMode && onPickDiagram(sectionId, item.id)} 
            style={[styles.addDiagramBtn, item.diagramUri === "NEEDS_CROP" && styles.addDiagramBtnHighlight]}
          >
             <Ionicons name={item.diagramUri === "NEEDS_CROP" ? "scan-outline" : "image-outline"} size={18} color={item.diagramUri === "NEEDS_CROP" ? "#2563EB" : "#6B7280"} />
             <Text style={[styles.addDiagramText, item.diagramUri === "NEEDS_CROP" && styles.addDiagramTextHighlight]}>
               {item.diagramUri === "NEEDS_CROP" ? "AI Detected Diagram (Tap to crop)" : "Add Diagram"}
             </Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Image source={{ uri: item.diagramUri }} style={[styles.qImage, item.hideText && {borderColor:'#2563EB', borderWidth:2}]} resizeMode="contain" />
             <View style={styles.diagramControl}>
               <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                  <Text style={styles.ctrlSub}>Settings</Text>
                  <View style={{flexDirection:'row', gap:8, alignItems: 'center'}}>
                    <TouchableOpacity onPress={() => !isSelectMode && onPickDiagram(sectionId, item.id)} style={{marginRight: 4}}>
                      <Ionicons name="crop" size={18} color="#2563EB" />
                    </TouchableOpacity>
                    {(['S','M','L'] as const).map(sz => (
                      <TouchableOpacity key={sz} disabled={isSelectMode} onPress={() => onUpdate(sectionId, item.id, 'diagramSize', sz)} style={[styles.sizeBadge, currentSize === sz && styles.sizeBadgeActive]}>
                        <Text style={[styles.sizeText, currentSize === sz && styles.sizeTextActive]}>{sz}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{width:1, height:16, backgroundColor:'#ddd', marginHorizontal:2}} />
                    <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>HIDE</Text><Switch value={item.hideText} onValueChange={v => onUpdate(sectionId, item.id, 'hideText', v)} disabled={isSelectMode} trackColor={{false:"#e5e7eb",true:"#2563EB"}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                    <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>FULL</Text><Switch value={item.isFullWidth} onValueChange={v => onUpdate(sectionId, item.id, 'isFullWidth', v)} disabled={isSelectMode} trackColor={{false:"#e5e7eb",true:"#2563EB"}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                  </View>
               </View>
            </View>
          </View>
        ))
      )}

      {!isInstruction && (
        <View style={styles.qFooter}><Text style={styles.markLabel}>Marks</Text><TextInput style={styles.markInput} value={item.marks} onChangeText={t => onUpdate(sectionId, item.id, 'marks', t)} keyboardType="numeric" placeholder="-" placeholderTextColor="#bbb" editable={!isSelectMode}/></View>
      )}

      {/* MOVE MODAL */}
      <Modal visible={showMoveMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowMoveMenu(false)} activeOpacity={1}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Move to Section</Text>
            {otherSections.map(s => (
              <TouchableOpacity key={s.id} style={styles.menuItem} onPress={() => { onMoveToSection(sectionId, item.id, s.id); setShowMoveMenu(false); }}>
                <Text style={styles.menuText}>{s.title}</Text>
                <Ionicons name="arrow-forward" size={14} color="#2563EB" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* TYPE DROPDOWN MODAL */}
      <Modal visible={showTypeMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowTypeMenu(false)} activeOpacity={1}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Select Format</Text>
            
            {[
              { id: 'standard', label: 'Question Box', icon: 'text' },
              { id: 'mcq', label: 'Multiple Choice (MCQ)', icon: 'list' },
              { id: 'instruction', label: 'Instruction / Subheading', icon: 'information-circle' }
            ].map((opt) => (
              <TouchableOpacity 
                key={opt.id} 
                style={[styles.dropdownItem, item.type === opt.id && styles.dropdownItemActive]} 
                onPress={() => { 
                  onUpdate(sectionId, item.id, 'type', opt.id); 
                  setShowTypeMenu(false); 
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={opt.icon as any} size={18} color={item.type === opt.id ? '#2563EB' : '#6B7280'} />
                  <Text style={[styles.dropdownItemText, item.type === opt.id && styles.dropdownItemTextActive]}>
                    {opt.label}
                  </Text>
                </View>
                {/* The Checkmark for the currently selected option */}
                {item.type === opt.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* SNIPPET IMAGE SOURCE MODAL */}
      <Modal visible={showSnippetMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSnippetMenu(false)} activeOpacity={1}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Add Formula Snippet</Text>
            
            <TouchableOpacity style={styles.dropdownItem} onPress={async () => {
              setShowSnippetMenu(false);
              const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true });
              processSnippet(result);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="camera" size={18} color="#6B7280" />
                <Text style={styles.dropdownItemText}>Take Photo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dropdownItem} onPress={async () => {
              setShowSnippetMenu(false);
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true });
              processSnippet(result);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="images" size={18} color="#6B7280" />
                <Text style={styles.dropdownItemText}>Choose from Gallery</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* CRITICAL FIX: Invisible Overlay. This catches taps ONLY when in Select Mode, protecting the inputs underneath! */}
      {isSelectMode && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 10, borderRadius: 16 }]}
          onPress={() => onToggleSelect(item.id)}
          activeOpacity={0.4}
        />
      )}
    </View>
  );
});

const SectionCard = memo(({ 
  section, index, allSections, onUpdateSection, onDeleteSection, 
  onUpdateQ, onDeleteQ, onMoveQ, onAddQ, onPasteScan, onPickDiagram, onMoveToSection, onRescanSection,
  isSelectMode, selectedIds, onToggleSelect
}: { 
  section: Section, index: number, 
  allSections: { id: string; title: string }[],
  onUpdateSection: (id: string, field: keyof Section, val: any) => void,
  onDeleteSection: (id: string) => void,
  onUpdateQ: any, onDeleteQ: any, onMoveQ: any, onAddQ: any, onPasteScan: any, onPickDiagram: any, onMoveToSection: any, onRescanSection: (secId: string, currentRescans?: number) => void,
  isSelectMode: boolean, selectedIds: Set<string>, onToggleSelect: (qId: string) => void
}) => (
  <View style={styles.sectionContainer}>
    <View style={styles.sectionHeader}>
      <TextInput style={styles.sectionTitleInput} value={section.title} onChangeText={t => onUpdateSection(section.id, 'title', t)} placeholder="Section Title" editable={!isSelectMode} />
      <View style={styles.sectionTools}>
         <TouchableOpacity onPress={() => onUpdateSection(section.id, 'showDivider', !section.showDivider)} style={[styles.dividerBadge, section.showDivider && styles.dividerBadgeActive]} disabled={isSelectMode}>
            <Ionicons name="remove" size={14} color={section.showDivider ? "white" : "#555"} />
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onUpdateSection(section.id, 'layout', LAYOUT_CYCLE[section.layout] || '1-column')} style={[styles.layoutBadge, section.layout !== '1-column' && styles.layoutBadgeActive]} disabled={isSelectMode}>
            <Text style={[styles.layoutText, section.layout !== '1-column' && {color:'white'}]}>{LAYOUT_LABEL[section.layout] || '1 Col'}</Text>
         </TouchableOpacity>
         {/* THE NEW RESCAN BUTTON */}
         <TouchableOpacity onPress={() => onRescanSection(section.id, section.rescanCount)} style={[styles.layoutBadge, { backgroundColor: '#DBEAFE' }]} disabled={isSelectMode}>
            <Ionicons name="refresh" size={14} color="#2563EB" />
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onDeleteSection(section.id)} style={styles.delSectionBtn} disabled={isSelectMode}><Ionicons name="close" size={16} color="#ef4444" /></TouchableOpacity>
      </View>
    </View>
    
    {section.questions.map((q, idx) => (
      <QuestionCard key={q.id} item={q} sectionId={section.id} allSections={allSections} onUpdate={onUpdateQ} onDelete={onDeleteQ} onMove={onMoveQ} onPickDiagram={onPickDiagram} onMoveToSection={onMoveToSection} isSelectMode={isSelectMode} isSelected={selectedIds.has(q.id)} onToggleSelect={onToggleSelect}/>
      ))}

    <View style={styles.sectionFooter}>
       <TouchableOpacity onPress={() => onPasteScan(section.id)} style={styles.secActionBtn} disabled={isSelectMode}><Ionicons name="camera" size={16} color="#2563EB" /><Text style={styles.secActionText}>Scan</Text></TouchableOpacity>
       <TouchableOpacity onPress={() => onAddQ(section.id)} style={styles.secActionBtn} disabled={isSelectMode}><Ionicons name="add" size={16} color="#2563EB" /><Text style={styles.secActionText}>Question</Text></TouchableOpacity>
    </View>
  </View>
));

// --- MAIN SCREEN ---

export default function EditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams(); 
  
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const initialData = Array.isArray(params.initialData) ? params.initialData[0] : params.initialData;

  const [currentProjectId, setCurrentProjectId] = useState<string>(projectId || Date.now().toString());
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [header, setHeader] = useState<any>({
    schoolName: "", title: "Mid-Term Examination", 
    duration: "", totalMarks: "50", instructions: ""
  });
  const [sections, setSections] = useState<Section[]>([]);
  // Change from the old 3 fonts to the new ones
  const [fontTheme, setFontTheme] = useState<'inter' | 'times' | 'bookman' | 'calibri' | 'arial' | 'garamond'>('calibri');
  const [scanStatus, setScanStatus] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [scanMenuConfig, setScanMenuConfig] = useState<{ visible: boolean, sectionId: string | null, isRescan: boolean }>({ visible: false, sectionId: null, isRescan: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportedPdfUri, setExportedPdfUri] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);

  // --- NEW: STOP LOSS STATE TRACKERS ---
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const latestState = useRef({ sections, header, fontTheme, currentProjectId });

  // Derived: lightweight section list for move-to-section picker
  const sectionList = sections.map(s => ({ id: s.id, title: s.title }));

  // 1. Keep a reference of the absolute latest data so the "Save & Exit" button has the right data
  useEffect(() => {
    latestState.current = { sections, header, fontTheme, currentProjectId };
    setHasUnsavedChanges(true); // If ANY data changes, lock the exit door
  }, [sections, header, fontTheme, currentProjectId]);

  // 2. The Navigation Interceptor (The Stop Loss)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // If the user already hit the manual "Save" button, let them leave smoothly!
      if (!hasUnsavedChanges) return; 

      // Prevent the default behavior of leaving the screen
      e.preventDefault();

      Alert.alert(
        "Save your progress?",
        "You have unsaved changes. Do you want to save them before leaving?",
        [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          { 
            text: "Discard", 
            style: "destructive", 
            onPress: () => navigation.dispatch(e.data.action) // Force leave without saving
          },
          { 
            text: "Save & Exit", 
            isPreferred: true,
            onPress: async () => {
              const { sections: s, header: h, fontTheme: f, currentProjectId: id } = latestState.current;
              
              // CHANGE THIS BLOCK:
              const project = {
                id: id, title: h.title, updatedAt: Date.now(),
                header: h, sections: s, 
                settings: { fontTheme: f } // <-- REMOVED the old 'typewriter' hack
              };
              
              await saveProject(project as any); // Added 'as any' to bypass strict Storage types for now
              navigation.dispatch(e.data.action);
            }
          }
        ]
      );
    });

    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  useEffect(() => {
    const init = async () => {
      // 1. Fetch user defaults first
      const appDefaults = await getAppSettings();

      if (projectId) {
        const saved = await getProject(projectId);
        if (saved) {
          setHeader(saved.header);
          setFontTheme(saved.settings?.fontTheme as any || 'calibri');
          if (saved.sections && saved.sections.length > 0) {
            setSections(saved.sections);
          } else if (saved.questions && saved.questions.length > 0) {
            setSections([{ id: 'default_section', title: 'Section A', layout: '1-column', questions: saved.questions.map(q => ({...q, type: 'standard'})) }]);
          } else {
             setSections([{ id: Date.now().toString(), title: 'Section A', layout: '1-column', questions: [] }]);
          }
          setCurrentProjectId(saved.id);
        }
      } 
      else if (initialData) {
        // This is a NEW project, apply the user's defaults
        const newHeader = {
          ...header,
          schoolName: appDefaults.organizationName,
          duration: appDefaults.defaultDuration,
          instructions: appDefaults.defaultInstructions
        };
        setHeader(newHeader);
        setFontTheme((appDefaults.defaultFontTheme as any) || 'calibri');

        try {
          const parsed = JSON.parse(initialData);
          const isSectionData = parsed.length > 0 && parsed[0].questions;
          if (isSectionData) {
            const sanitizedSections = parsed.map((sec: any) => ({
              ...sec, id: sec.id || Date.now().toString() + Math.random(),
              questions: sec.questions.map((q: any) => ({ ...q, id: q.id || Date.now().toString() + Math.random() }))
            }));
            setSections(sanitizedSections);
            saveToDrafts(sanitizedSections, newHeader, appDefaults.defaultFontTheme);
          } else {
            const formatted = parsed.map((q: any, index: number) => ({
              id: Date.now().toString() + index, number: "", text: q.text || q.question_text || "", 
              marks: (q.marks || "").toString(), diagramUri: q.diagramUri, 
              hideText: q.has_diagram ? true : false, isFullWidth: false, type: 'standard', options: []
            }));
            const newSection: Section = { id: Date.now().toString(), title: 'Section A', layout: '1-column', questions: formatted };
            setSections([newSection]);
            saveToDrafts([newSection], newHeader, appDefaults.defaultFontTheme);
          }
        } catch (e) { Alert.alert("Error", "Could not load scan data"); }
      }
    };
    init();
  }, [initialData, projectId]);

  const saveToDrafts = async (secs: Section[], hd: any, ft: any) => {
    const project: ExamProject = {
      id: currentProjectId, title: hd.title, updatedAt: Date.now(),
      header: hd, sections: secs, settings: { fontTheme: ft }
    };
    await saveProject(project);
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    await saveToDrafts(sections, header, fontTheme);
    setIsSaving(false);
    setHasUnsavedChanges(false); // <-- Unlocks the exit door!
    Alert.alert("Saved", "Draft updated successfully.");
  };

  const handleTogglePreview = async () => {
    if (viewMode === 'edit') {
      const html = await generateExamHtml(header, sections, fontTheme);
      setPreviewHtml(html);
      setViewMode('preview');
    } else {
      setViewMode('edit');
    }
  };

  const handleExport = async () => {
    try {
      await saveToDrafts(sections, header, fontTheme);
      const html = await generateExamHtml(header, sections, fontTheme);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      setExportedPdfUri(uri);
      setShowExportMenu(true);
    } catch (e) { Alert.alert("Export Failed", "Could not generate PDF."); }
  };

  const handleDownload = async () => {
    if (!exportedPdfUri) return;
    try {
      // NEW STANDARDIZED NAMING CONVENTION
      const cleanTitle = (header.title || 'Exam').trim().replace(/[^a-z0-9 \-]/gi, '');
      const cleanSubject = (header.className || 'Subject').trim().replace(/[^a-z0-9 \-]/gi, '');
      const dateStr = new Date().toISOString().split('T')[0]; // Creates YYYY-MM-DD
      const fileName = `${cleanSubject} - ${cleanTitle} - ${dateStr}.pdf`;
      
      // Save to app folder first
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      const appUri = docDir + fileName;
      await FileSystem.copyAsync({ from: exportedPdfUri, to: appUri });
      
      // Try to save to MediaLibrary
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          // FIX: Save the cleanly named appUri, NOT the gibberish exportedPdfUri!
          await MediaLibrary.saveToLibraryAsync(appUri);
          setShowExportMenu(false);
          setExportedPdfUri(null);
          Alert.alert("Success", "PDF saved to Downloads!");
        } else {
          // Permission denied, use share as fallback
          setShowExportMenu(false);
          setExportedPdfUri(null);
          // FIX: Share the cleanly named appUri!
          await Sharing.shareAsync(appUri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
      } catch (mediaError) {
        // MediaLibrary failed (e.g., Expo Go limitations), use share as fallback
        setShowExportMenu(false);
        setExportedPdfUri(null);
        // FIX: Share the cleanly named appUri!
        await Sharing.shareAsync(appUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (e) {
      Alert.alert("Download Failed", "Could not save PDF. Try Share instead.");
    }
  };

  const handleShare = async () => {
    if (!exportedPdfUri) return;
    try {
      // NEW STANDARDIZED NAMING CONVENTION
      const cleanTitle = (header.title || 'Exam').trim().replace(/[^a-z0-9 \-]/gi, '');
      const cleanSubject = (header.className || 'Subject').trim().replace(/[^a-z0-9 \-]/gi, '');
      const dateStr = new Date().toISOString().split('T')[0]; 
      const fileName = `${cleanSubject} - ${cleanTitle} - ${dateStr}.pdf`;
      
      // Save to app folder
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      const appUri = docDir + fileName;
      await FileSystem.copyAsync({ from: exportedPdfUri, to: appUri });
      
      // FIX: Share the cleanly named appUri!
      await Sharing.shareAsync(appUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
      setShowExportMenu(false);
      setExportedPdfUri(null);
    } catch (e) {
      Alert.alert("Share Failed", "Could not share PDF.");
    }
  };

  const toggleSelectQuestion = (qId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(qId)) {
      newSelected.delete(qId);
    } else {
      newSelected.add(qId);
    }
    setSelectedIds(newSelected);
  };

  // --- ACTIONS ---
  const addSection = () => setSections(prev => [...prev, { id: Date.now().toString(), title: "New Section", layout: '1-column', questions: [] }]);
  const updateSection = useCallback((id: string, field: keyof Section, value: any) => setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s)), []);
  const deleteSection = useCallback((id: string) => Alert.alert("Delete Section?", "Remove all questions?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => setSections(prev => prev.filter(s => s.id !== id)) }]), []);
  const updateQ = useCallback((secId: string, qId: string, field: any, value: any) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: s.questions.map(q => q.id === qId ? { ...q, [field]: value } : q) } : s)), []);
  const deleteQ = useCallback((secId: string, qId: string) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: s.questions.filter(q => q.id !== qId) } : s)), []);
  const addQ = (secId: string) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: [...s.questions, { id: Date.now().toString(), number: "", text: "", marks: "", type: 'standard', options:["","","",""] }] } : s));
  const moveQ = useCallback((secId: string, idx: number, dir: 'up' | 'down') => {
    setSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const qs = [...s.questions];
      if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === qs.length - 1)) return s;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      [qs[idx], qs[target]] = [qs[target], qs[idx]];
      return { ...s, questions: qs };
    }));
  }, []);

  // MOVE QUESTION BETWEEN SECTIONS
  const moveToSection = useCallback((fromSecId: string, qId: string, toSecId: string) => {
    setSections(prev => {
      const fromSec = prev.find(s => s.id === fromSecId);
      if (!fromSec) return prev;
      const question = fromSec.questions.find(q => q.id === qId);
      if (!question) return prev;
      return prev.map(s => {
        if (s.id === fromSecId) return { ...s, questions: s.questions.filter(q => q.id !== qId) };
        if (s.id === toSecId) return { ...s, questions: [...s.questions, question] };
        return s;
      });
    });
  }, []);

  // THE NEW BULK MOVE LOGIC
  const handleBulkMove = (toSecId: string) => {
    setSections(prev => {
      // 1. Find all selected questions across all sections
      const movingQs: Question[] = [];
      prev.forEach(s => {
        s.questions.forEach(q => {
          if (selectedIds.has(q.id)) movingQs.push(q);
        });
      });

      // 2. Remove them from old sections and dump into the new one
      return prev.map(s => {
        if (s.id === toSecId) return { ...s, questions: [...s.questions, ...movingQs] };
        return { ...s, questions: s.questions.filter(q => !selectedIds.has(q.id)) };
      });
    });
    // Reset the UI
    setSelectedIds(new Set());
    setIsSelectMode(false);
    setShowBulkMoveMenu(false);
  };
  
  // NATIVE CROP HANDLER
  const handlePickDiagram = async (secId: string, qId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        updateQ(secId, qId, 'diagramUri', result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert("Error", "Could not pick image.");
    }
  };

  // NEW: The Fairness Engine Scanner
  const processPageScan = async (secId: string, result: ImagePicker.ImagePickerResult, isRescan: boolean = false) => {
    if (!result.canceled && result.assets && result.assets[0]) {
      try {
        setScanStatus('Warming up AI engine...');
        const geminiResult = await transcribeHandwriting([{ uri: result.assets[0].uri }], (msg) => setScanStatus(msg));
        
        let newQuestions: Question[] = [];
        if (geminiResult.sections) {
          geminiResult.sections.forEach((s: any) => { newQuestions.push(...s.questions); });
        }

        // --- THE FAIRNESS RULES ---

        // Rule 1: Zero Questions Found (Total Failure)
        if (newQuestions.length === 0) {
          Alert.alert("Scan Failed", "We couldn't detect any questions on this page. Please try taking a brighter photo.\n\n(No scan token was deducted).");
          return;
        }

        // Rule 2: Low Yield (1 or 2 questions)
        if (newQuestions.length <= 2 && !isRescan) {
          Alert.alert(
            "Low Questions Detected", 
            `We only found ${newQuestions.length} question(s). Do you want to keep this (Costs 1 Token) or discard and try again (Free)?`,
            [
              { text: "Discard (Free)", style: "cancel" },
              { text: "Keep (-1 Token)", onPress: async () => {
                  await deductScanToken();
                  setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: [...s.questions, ...newQuestions] } : s));
              }}
            ]
          );
          return;
        }

        // Rule 3: Success! Inject questions and charge the toll (if not a free rescan)
        if (!isRescan) {
          await deductScanToken();
        }
        
        setSections(prev => prev.map(s => {
          if (s.id === secId) {
            // If it's a rescan, we REPLACE the old questions. Otherwise, we ADD to them.
            return { 
              ...s, 
              rescanCount: isRescan ? (s.rescanCount || 0) + 1 : s.rescanCount,
              questions: isRescan ? newQuestions : [...s.questions, ...newQuestions] 
            };
          }
          return s;
        }));

      } catch (e) { 
        Alert.alert("Error", "Scan completely failed. No tokens were deducted."); 
      } finally { 
        setScanStatus(''); 
      }
    }
  };

  const handleScanToSection = async (secId: string) => {
    const canScan = await checkScanEligibility();
    if (canScan) {
      setScanMenuConfig({ visible: true, sectionId: secId, isRescan: false });
    } else {
      setShowPaywall(true);
    }
  };

  const handleRescanSection = (secId: string, currentRescans: number = 0) => {
    if (currentRescans >= 2) {
      Alert.alert("Free Rescans Exhausted", "You have used your 2 free rescans for this section. Scanning again will cost a regular token.", [
        { text: "Cancel", style: "cancel" },
        { text: "Use Token", onPress: () => handleScanToSection(secId) }
      ]);
    } else {
      setScanMenuConfig({ visible: true, sectionId: secId, isRescan: true });
    }
  };
  const handleHome = () => {
    router.back(); 
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      {/* HEADER NAV */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={handleHome} style={styles.navBack}><Ionicons name="home-outline" size={24} color="#111" /></TouchableOpacity>
        
        {/* VIEW MODE TOGGLE */}
        <View style={styles.toggleContainer}>
           <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'edit' && styles.toggleActive]}>
              <Text style={[styles.toggleText, viewMode === 'edit' && styles.toggleTextActive]}>Edit</Text>
           </TouchableOpacity>
           <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'preview' && styles.toggleActive]}>
              <Text style={[styles.toggleText, viewMode === 'preview' && styles.toggleTextActive]}>Preview</Text>
           </TouchableOpacity>
        </View>

        {/* ADD THIS BUTTON RIGHT BEFORE THE SAVE BUTTON */}
        <View style={{flexDirection: 'row', gap: 10}}>
          <TouchableOpacity 
            onPress={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()); }} 
            style={[styles.saveBtn, isSelectMode && {backgroundColor:'#2563EB'}]}
          >
            <Ionicons name="checkbox-outline" size={20} color={isSelectMode ? "white" : "#2563EB"} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleManualSave} style={styles.saveBtn} disabled={isSaving}>
            {isSaving ? <ActivityIndicator size="small" color="#2563EB"/> : <Ionicons name="save-outline" size={20} color="#2563EB" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENT AREA */}
      <View style={{ flex: 1 }}>
        {viewMode === 'edit' ? (
          // EDIT MODE
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <FlatList 
                data={sections} 
                keyExtractor={item => item.id} 
                renderItem={({ item, index }) => (
                    <SectionCard 
                        section={item} index={index} 
                        allSections={sectionList}
                        onUpdateSection={updateSection} onDeleteSection={deleteSection}
                        onUpdateQ={updateQ} onDeleteQ={deleteQ} onMoveQ={moveQ} onAddQ={addQ} onPasteScan={handleScanToSection}
                        onPickDiagram={handlePickDiagram}
                        onMoveToSection={moveToSection}
                        onRescanSection={handleRescanSection}
                        isSelectMode={isSelectMode}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelectQuestion}
                    />
                )}
                ListHeaderComponent={
                  <>
                    <HeaderEditor header={header} onChange={setHeader} />
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.fontBtn}>
                       <Text style={styles.fontBtnText}>Font: {fontTheme.toUpperCase()}</Text>
                       <Ionicons name="chevron-down" size={14} color="#555" />
                    </TouchableOpacity>
                  </>
                } 
                contentContainerStyle={styles.list} 
                showsVerticalScrollIndicator={false} 
                keyboardShouldPersistTaps="always"
                ListFooterComponent={
                    <View style={styles.footerActions}>
                      <TouchableOpacity onPress={addSection} style={styles.addBtn}>
                        <Text style={styles.addText}>+ Add New Section</Text>
                      </TouchableOpacity>
                    </View>
                }
            />
          </KeyboardAvoidingView>
        ) : (
          // PREVIEW MODE (WebView)
          <View style={styles.previewContainer}>
             <WebView 
               originWhitelist={['*']} 
               source={{ html: previewHtml }} 
               style={{ flex: 1 }}
               scalesPageToFit={false}
             />
             <TouchableOpacity onPress={handleExport} style={styles.fabPreview}>
                <Ionicons name="share-outline" size={24} color="white" />
                <Text style={styles.fabText}>Export PDF</Text>
             </TouchableOpacity>
          </View>
        )}
      </View>

      {viewMode === 'edit' && (
        <TouchableOpacity onPress={handleExport} style={styles.fab}><Ionicons name="share-outline" size={24} color="white" /><Text style={styles.fabText}>Export PDF</Text></TouchableOpacity>
      )}
      
      {/* SCAN PROGRESS TRACKER OVERLAY */}
      {scanStatus !== '' && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>

            {/* Header */}
            <View style={styles.loadingHeader}>
              <View style={styles.loadingIconRing}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
              <Text style={styles.loadingTitle}>Scanning Page</Text>
            </View>

            {/* Step tracker */}
            {[
              { key: 'Optimizing', label: 'Optimizing image',   icon: '⚡' },
              { key: 'AI reading', label: 'AI reading page',     icon: '🔍' },
              { key: 'Formatting', label: 'Formatting results',  icon: '✏️' },
              { key: 'Finalizing', label: 'Finalizing exam',     icon: '✅' },
            ].map((step, index) => {
              const isActive    = scanStatus.toLowerCase().includes(step.key.toLowerCase());
              const stepOrder   = ['Optimizing', 'AI reading', 'Formatting', 'Finalizing'];
              const activeIndex = stepOrder.findIndex(k => scanStatus.toLowerCase().includes(k.toLowerCase()));
              const isDone      = activeIndex > index;

              return (
                <View key={step.key} style={styles.stepRow}>
                  {/* Left indicator */}
                  <View style={[
                    styles.stepDot,
                    isDone   && styles.stepDotDone,
                    isActive && styles.stepDotActive,
                  ]}>
                    {isDone
                      ? <Text style={styles.stepDotText}>✓</Text>
                      : isActive
                        ? <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.6 }] }} />
                        : <Text style={styles.stepDotText}>{index + 1}</Text>
                    }
                  </View>

                  {/* Label */}
                  <Text style={[
                    styles.stepLabel,
                    isDone   && styles.stepLabelDone,
                    isActive && styles.stepLabelActive,
                  ]}>
                    {step.icon} {step.label}
                  </Text>

                  {/* Connector line (all except last) */}
                  {index < 3 && (
                    <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />
                  )}
                </View>
              );
            })}

            {/* Live status text */}
            <Text style={styles.loadingStatusText}>{scanStatus}</Text>
          </View>
        </View>
      )}

<Modal visible={showSettings} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSettings(false)} activeOpacity={1}>
           <View style={styles.menu}>
              <Text style={styles.menuTitle}>Font Theme</Text>
              {[
                { id: 'calibri', label: 'Calibri (Modern)' },
                { id: 'times', label: 'Times New Roman' },
                { id: 'bookman', label: 'Bookman Old Style' },
                { id: 'arial', label: 'Arial' },
                { id: 'garamond', label: 'Garamond (Classic)' },
                { id: 'inter', label: 'Inter (Clean)' }
              ].map((f) => (
                <TouchableOpacity key={f.id} style={styles.menuItem} onPress={() => { setFontTheme(f.id as any); setShowSettings(false); }}>
                  <Text style={styles.menuText}>{f.label}</Text>
                  {fontTheme === f.id && <Ionicons name="checkmark" size={18} color="#2563EB"/>}
                </TouchableOpacity>
              ))}
           </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showExportMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.exportModal}>
            <Text style={styles.exportTitle}>Export PDF</Text>
            <Text style={styles.exportSub}>Choose how to save your exam paper</Text>
            <View style={styles.exportButtons}>
              <TouchableOpacity onPress={handleDownload} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="download" size={32} color="#2563EB" />
                </View>
                <Text style={styles.exportBtnText}>Download</Text>
                <Text style={styles.exportBtnSub}>Save to device</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="share-social" size={32} color="#2563EB" />
                </View>
                <Text style={styles.exportBtnText}>Share</Text>
                <Text style={styles.exportBtnSub}>Send via apps</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => { setShowExportMenu(false); setExportedPdfUri(null); }} style={styles.exportCancel}>
              <Text style={styles.exportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SCAN IMAGE SOURCE MODAL */}
      <Modal visible={scanMenuConfig.visible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setScanMenuConfig({ visible: false, sectionId: null, isRescan: false })} activeOpacity={1}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Scan New Page</Text>
            
            <TouchableOpacity style={styles.dropdownItem} onPress={async () => {
              const secId = scanMenuConfig.sectionId;
              const isRescan = scanMenuConfig.isRescan;
              setScanMenuConfig({ visible: false, sectionId: null, isRescan: false });
              if (secId) {
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
                processPageScan(secId, result, isRescan);
              }
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="camera" size={18} color="#6B7280" />
                <Text style={styles.dropdownItemText}>Camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dropdownItem} onPress={async () => {
              const secId = scanMenuConfig.sectionId;
              const isRescan = scanMenuConfig.isRescan;
              setScanMenuConfig({ visible: false, sectionId: null, isRescan: false });
              if (secId) {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
                processPageScan(secId, result, isRescan);
              }
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="images" size={18} color="#6B7280" />
                <Text style={styles.dropdownItemText}>Gallery</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* PAYWALL MODAL */}
      <Modal visible={showPaywall} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.exportModal}>
            <Text style={styles.exportTitle}>Out of Scan Tokens</Text>
            <Text style={styles.exportSub}>Purchase more tokens to continue scanning</Text>
            <View style={styles.exportButtons}>
              <TouchableOpacity onPress={async () => {
                // --- THE BYPASS ---
                if (Constants.appOwnership === 'expo') {
                  await purchaseTokens(10);
                  setShowPaywall(false);
                  Alert.alert("Expo Go Mode", "Mock payment successful. Tokens added!");
                  return;
                }
                // ------------------

                try {
                  // 1. Fetch the products you set up in the RevenueCat dashboard
                  const offerings = await Purchases.getOfferings();
                  
                  // 2. Look for the specific "10 Scans" package (you will name this in the dashboard)
                  const packageToBuy = offerings.current?.availablePackages.find(p => p.identifier === '10_scans_pack');
                  
                  if (packageToBuy) {
                    // 3. Trigger the native Apple/Google payment sheet!
                    const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
                    
                    // 4. If payment succeeds, give them the tokens locally!
                    await purchaseTokens(10);
                    setShowPaywall(false);
                    Alert.alert("Payment Successful!", "10 Scans have been added to your account.");
                  } else {
                    Alert.alert("Store Error", "Product not found. Please try again later.");
                  }
                } catch (e: any) {
                  if (!e.userCancelled) {
                    Alert.alert("Payment Failed", e.message);
                  }
                }
              }} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="add-circle" size={32} color="#2563EB" />
                </View>
                <Text style={styles.exportBtnText}>10 Tokens</Text>
                <Text style={styles.exportBtnSub}>$2.99</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                // --- THE BYPASS ---
                if (Constants.appOwnership === 'expo') {
                  await purchaseTokens(50);
                  setShowPaywall(false);
                  Alert.alert("Expo Go Mode", "Mock payment successful. Tokens added!");
                  return;
                }
                // ------------------

                try {
                  // 1. Fetch the products you set up in the RevenueCat dashboard
                  const offerings = await Purchases.getOfferings();
                  
                  // 2. Look for the specific "50 Scans" package (you will name this in the dashboard)
                  const packageToBuy = offerings.current?.availablePackages.find(p => p.identifier === '50_scans_pack');
                  
                  if (packageToBuy) {
                    // 3. Trigger the native Apple/Google payment sheet!
                    const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
                    
                    // 4. If payment succeeds, give them the tokens locally!
                    await purchaseTokens(50);
                    setShowPaywall(false);
                    Alert.alert("Payment Successful!", "50 Scans have been added to your account.");
                  } else {
                    Alert.alert("Store Error", "Product not found. Please try again later.");
                  }
                } catch (e: any) {
                  if (!e.userCancelled) {
                    Alert.alert("Payment Failed", e.message);
                  }
                }
              }} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="add-circle" size={32} color="#2563EB" />
                </View>
                <Text style={styles.exportBtnText}>50 Tokens</Text>
                <Text style={styles.exportBtnSub}>$9.99</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowPaywall(false)} style={styles.exportCancel}>
              <Text style={styles.exportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BULK ACTION BAR */}
      {isSelectMode && selectedIds.size > 0 && (
        <View style={styles.bulkActionBar}>
          <Text style={styles.bulkActionText}>{selectedIds.size} Selected</Text>
          <TouchableOpacity onPress={() => setShowBulkMoveMenu(true)} style={styles.bulkActionBtn}>
            <Text style={styles.bulkActionBtnText}>Move to Section</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BULK MOVE MODAL */}
      <Modal visible={showBulkMoveMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowBulkMoveMenu(false)} activeOpacity={1}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Move {selectedIds.size} Items To...</Text>
            {sectionList.map(s => (
              <TouchableOpacity key={s.id} style={styles.menuItem} onPress={() => handleBulkMove(s.id)}>
                <Text style={styles.menuText}>{s.title}</Text>
                <Ionicons name="arrow-forward" size={14} color="#2563EB" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  navBack: { padding: 8 },
  
  toggleContainer: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 8, padding: 2 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 },
  toggleActive: { backgroundColor: 'white', shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#111' },

  saveBtn: { padding: 8, backgroundColor: '#EFF6FF', borderRadius: 20 },
  list: { padding: 16, paddingBottom: 100 },
  headerCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 10 },
  fontBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap:6, padding:10, backgroundColor: 'white', borderRadius: 12, marginBottom: 20 },
  fontBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },

  schoolInput: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: '#111' },
  titleInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#555', marginBottom: 6 },
  classInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#888', marginBottom: 20 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metaBox: { flex: 1, backgroundColor: '#f9fafb', padding: 10, borderRadius: 8 },
  label: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
  metaInput: { fontSize: 14, fontWeight: '700', color: '#111' },
  instructionBox: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 8 },
  instInput: { fontSize: 13, color: '#1e3a8a', lineHeight: 20, minHeight: 40 },
  
  // SECTIONS
  sectionContainer: { marginBottom: 25 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  sectionTitleInput: { fontSize: 16, fontWeight: '800', color: '#1f2937', flex: 1, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 4 },
  sectionTools: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  dividerBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  dividerBadgeActive: { backgroundColor: '#111' },
  layoutBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e5e7eb' },
  layoutBadgeActive: { backgroundColor: '#111' },
  layoutText: { fontSize: 10, fontWeight: '700', color: '#555' },
  delSectionBtn: { padding: 4 },
  sectionFooter: { flexDirection: 'row', justifyContent: 'center', gap: 15, marginTop: 10 },
  secActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  secActionText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  // QUESTIONS
  qCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  qCardSelected: { backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: '#2563EB' },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  numTag: { backgroundColor: '#111', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  numInput: { color: 'white', fontWeight: 'bold', fontSize: 14, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#e5e7eb', marginLeft: 8 },
  typeBadgeMCQ: { backgroundColor: '#8b5cf6' },
  typeBadgeInstr: { backgroundColor: '#F59E0B' },
  typeText: { fontSize: 10, fontWeight: '800', color: '#555' },

  toolRow: { flexDirection: 'row', gap: 6 },
  toolBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  
  mcqContainer: { marginBottom: 12 },
  mcqRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  mcqOption: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: '#F3F4F6' },
  mcqLabel: { fontWeight: '800', color: '#9CA3AF', marginRight: 6, fontSize: 12 },
  mcqInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#374151' },

  // DIAGRAM CROP UI
  addDiagramBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 8, padding: 12, marginTop: 8, marginBottom: 8 },
  addDiagramBtnHighlight: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  addDiagramText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  addDiagramTextHighlight: { color: '#2563EB' },

  diagramControl: { backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#dcfce7' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ctrlLabel: { fontSize: 12, fontWeight: '700', color: '#166534', marginBottom: 8 },
  ctrlSub: { fontSize: 11, color: '#15803d' },

  // SIZE BADGES
  sizeBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  sizeBadgeActive: { backgroundColor: '#2563EB' },
  sizeText: { fontSize: 10, fontWeight: '800', color: '#555' },
  sizeTextActive: { color: 'white' },

  qInput: { fontSize: 16, lineHeight: 24, color: '#374151', minHeight: 40, textAlignVertical: 'top' },
  dimmedInput: { opacity: 0.4, fontStyle: 'italic' },
  instructionInput: { fontWeight: '700', fontSize: 15, color: '#111' },
  qImage: { width: '100%', height: 180, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 12 },
  qFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  markLabel: { fontSize: 12, color: '#9ca3af', marginRight: 8 },
  markInput: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, fontWeight: 'bold', minWidth: 40, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  footerActions: { marginTop: 20, marginBottom: 40 },
  addBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, backgroundColor: '#e5e7eb' },
  addText: { color: '#374151', fontWeight: '700' },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 32, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: {width:0, height:4}, elevation: 5 },
  fabPreview: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 32, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: {width:0, height:4}, elevation: 5 },
  fabText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  previewContainer: { flex: 1, backgroundColor: '#eee' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  menu: { width: 220, backgroundColor: 'white', borderRadius: 12, padding: 8, shadowColor: "#000", shadowOpacity: 0.1, elevation: 10 },
  menuTitle: { fontSize: 11, fontWeight: '700', color: '#999', padding: 8, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8 },
  menuText: { fontSize: 14, color: '#111' },
  
  // --- Dropdown Menu Styles ---
  dropdownMenu: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: 280, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  dropdownTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingHorizontal: 8 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  dropdownItemActive: { backgroundColor: '#EFF6FF' },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: '#374151' },
  dropdownItemTextActive: { color: '#2563EB', fontWeight: '700' },
  
  // Export Modal
  exportModal: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 24, alignItems: 'center' },
  exportTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
  exportSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  exportButtons: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  exportBtn: { flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  exportIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  exportBtnText: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  exportBtnSub: { fontSize: 12, color: '#6B7280' },
  exportCancel: { paddingVertical: 12, paddingHorizontal: 24 },
  exportCancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },

  // --- Scan Progress Overlay ---
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  loadingBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    width: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
  },
  loadingHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 24,
  },
  loadingIconRing: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#2563EB',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  loadingTitle: {
    fontSize: 17, fontWeight: '800', color: '#111',
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, position: 'relative',
  },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, zIndex: 1,
  },
  stepDotActive: {
    backgroundColor: '#2563EB',
  },
  stepDotDone: {
    backgroundColor: '#16A34A',
  },
  stepDotText: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
  },
  stepLabel: {
    fontSize: 14, fontWeight: '500', color: '#9CA3AF', flex: 1,
  },
  stepLabelActive: {
    color: '#2563EB', fontWeight: '700',
  },
  stepLabelDone: {
    color: '#16A34A', fontWeight: '600',
  },
  stepConnector: {
    position: 'absolute', left: 13, top: 28,
    width: 2, height: 14, backgroundColor: '#E5E7EB', zIndex: 0,
  },
  stepConnectorDone: {
    backgroundColor: '#16A34A',
  },
  loadingStatusText: {
    marginTop: 12, fontSize: 12, color: '#6B7280',
    fontWeight: '500', textAlign: 'center',
  },

  // --- Bulk Action Bar Styles ---
  bulkActionBar: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 32, width: '80%', shadowColor: "#000", shadowOpacity: 0.3, shadowOffset: {width:0, height:6}, elevation: 8 },
  bulkActionText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  bulkActionBtn: { backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  bulkActionBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },

  // --- Quick Format Toolbar ---
  formatToolbar: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4, paddingHorizontal: 2 },
  formatBtn: { backgroundColor: '#F9FAFB', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  formatBtnText: { color: '#4B5563', fontSize: 13, fontWeight: '700' },
});
import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator, Modal, ScrollView, ViewToken
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
import { saveProject, getProject, ExamProject, Section, Question, checkScanEligibility, deductScanToken, purchaseTokens, getAppSettings, saveAppSettings } from '../core/services/storage'; 
import { purchaseScanPack } from '../core/services/purchases';
import { generateExamHtml } from '../core/services/pdf';
import * as Haptics from 'expo-haptics';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SpotlightTour, { TourStep } from '../components/SpotlightTour';
import { usePostHog } from 'posthog-react-native';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

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

const EDITOR_TOUR_STEPS: TourStep[] = [
  {
    refKey: 'toggleContainer',
    title: 'Edit & Preview',
    description: 'Switch to Preview mode to see exactly how your final paper will look before exporting. Tap Edit to come back and make changes.',
    tooltipPosition: 'bottom',
  },
  {
    refKey: 'guideBtn',
    title: 'Format Guide',
    description: 'Tap the book icon anytime to open the full formatting reference — bold, italic, MCQ layouts, column controls, and more.',
    tooltipPosition: 'bottom',
  },
  {
    refKey: 'bottomBar',
    title: 'Your Action Bar',
    description: 'The three key actions: Save your draft so you never lose work, Add a new question to the last section, or Export the finished PDF.',
    tooltipPosition: 'top',
  },
  {
    refKey: 'sectionTools',
    title: 'Section Controls',
    description: 'Each section has its own layout. Tap the column badge to switch between 1, 2, or 3 columns on the PDF. The line icon adds a divider above it.',
    tooltipPosition: 'bottom',
  },
  {
    refKey: 'typeBadge',
    title: 'Question Type',
    description: 'Tap this badge to change the type of a question. TEXT is a plain question, MCQ adds answer options A/B/C/D, and INSTR creates a bold subheading across all columns.',
    tooltipPosition: 'bottom',
  },
  {
    refKey: 'formatToolbar',
    title: 'Format Toolbar',
    description: 'Select text in the question box first, then tap Bold, Italic, or ___ to format it. The \\ce{} button renders chemical formulae like H₂O correctly in the PDF.',
    tooltipPosition: 'top',
  },
  {
    refKey: 'qFooter',
    title: 'Marks per Question',
    description: 'Type the marks for each question here. They appear next to the question on the final PDF. Leave blank for untimed or unweighted questions.',
    tooltipPosition: 'top',
  },
];

// --- SUB-COMPONENTS ---
const HeaderEditor = memo(({ header, onChange }: { header: any, onChange: (h: any) => void }) => (
  <View style={styles.headerCard}>
    <TextInput style={styles.schoolInput} value={header.schoolName} onChangeText={t => onChange({...header, schoolName: t})} placeholder="SCHOOL NAME" placeholderTextColor={colors.label.assistive} />
    <TextInput style={styles.titleInput} value={header.title} onChangeText={t => onChange({...header, title: t})} placeholder="EXAM TITLE" placeholderTextColor={colors.label.assistive} />
    <TextInput style={styles.classInput} value={header.className} onChangeText={t => onChange({...header, className: t})} placeholder="Subject / Class (e.g., Physics XII-A)" placeholderTextColor={colors.label.assistive} />
    <View style={styles.metaRow}>
      <View style={styles.metaBox}><Text style={styles.label}>DURATION</Text><TextInput style={styles.metaInput} value={header.duration} onChangeText={t => onChange({...header, duration: t})} placeholder="e.g. 2 Hours" placeholderTextColor={colors.label.assistive} /></View>
      <View style={styles.metaBox}><Text style={styles.label}>MARKS</Text><TextInput style={styles.metaInput} value={header.totalMarks} onChangeText={t => onChange({...header, totalMarks: t})} placeholder="e.g. 100" placeholderTextColor={colors.label.assistive} keyboardType="numeric" /></View>
    </View>
    <View style={styles.instructionBox}><Text style={styles.label}>INSTRUCTIONS</Text><TextInput style={styles.instInput} value={header.instructions} onChangeText={t => onChange({...header, instructions: t})} multiline placeholder="Enter instructions here..." placeholderTextColor={colors.label.assistive} /></View>
  </View>
));

const QuestionCard = memo(({ 
  item, sectionId, allSections, onUpdate, onDelete, onMove, onPickDiagram, onMoveToSection,
  isSelectMode, isSelected, onToggleSelect, onRegisterRefs
}: { 
  item: Question, sectionId: string, 
  allSections: { id: string; title: string }[],
  onUpdate: (sId: string, qId: string, field: keyof Question, val: any) => void,
  onDelete: (sId: string, qId: string) => void,
  onMove: (sId: string, qId: string, dir: 'up' | 'down') => void,
  onPickDiagram: (sId: string, qId: string) => void,
  onMoveToSection: (fromSecId: string, qId: string, toSecId: string) => void,
  isSelectMode: boolean, isSelected: boolean, onToggleSelect: (qId: string) => void,
  onRegisterRefs?: (refs: { typeBadge: any; formatToolbar: any; qFooter: any }) => void,
}) => {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const typeBadgeRef = useRef<any>(null);
  const formatToolbarRef = useRef<any>(null);
  const qFooterRef = useRef<any>(null);
  useEffect(() => {
    if (onRegisterRefs) {
      // Delay so layout is settled before measuring
      const t = setTimeout(() => {
        onRegisterRefs({
          typeBadge: typeBadgeRef.current,
          formatToolbar: formatToolbarRef.current,
          qFooter: qFooterRef.current,
        });
      }, 200);
      return () => clearTimeout(t);
    }
  }, []);
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
            <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? colors.primary.normal : colors.label.assistive} />
          )}
          {!isInstruction && (
            <View style={styles.numTag}>
              <TextInput style={styles.numInput} value={item.number} onChangeText={t => onUpdate(sectionId, item.id, 'number', t)} placeholder="#" placeholderTextColor={colors.label.assistive} editable={!isSelectMode} />
            </View>
          )}
          {/* THE TRIGGER BADGE */}
          <TouchableOpacity 
            ref={typeBadgeRef}
            onPress={() => setShowTypeMenu(true)} 
            disabled={isSelectMode} 
            style={[
              styles.typeBadge, 
              item.type === 'mcq' ? styles.typeBadgeMCQ : isInstruction ? styles.typeBadgeInstr : {},
              { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }
            ]}
          >
            <Text style={[styles.typeText, (item.type === 'mcq' || isInstruction) && {color: colors.background.normal}]}>
              {isInstruction ? 'INSTR' : item.type === 'mcq' ? 'MCQ' : 'TEXT'}
            </Text>
            <Ionicons 
              name="chevron-down" 
              size={12} 
              color={(item.type === 'mcq' || isInstruction) ? colors.background.normal : colors.primary.normal} 
            />
          </TouchableOpacity>
        </View>

        {!isSelectMode && (
          <View style={styles.toolRow}>
            <TouchableOpacity onPress={() => onMove(sectionId, item.id, 'up')} style={styles.toolBtn} accessibilityLabel="Move question up"><Ionicons name="arrow-up" size={16} color={colors.label.alternative} /></TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(sectionId, item.id, 'down')} style={styles.toolBtn} accessibilityLabel="Move question down"><Ionicons name="arrow-down" size={16} color={colors.label.alternative} /></TouchableOpacity>
            {otherSections.length > 0 && (
              <TouchableOpacity onPress={() => setShowMoveMenu(true)} style={[styles.toolBtn, {backgroundColor: colors.accent.blue.bg}]} accessibilityLabel="Move to another section"><Ionicons name="swap-horizontal" size={16} color={colors.primary.normal} /></TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onDelete(sectionId, item.id)} style={[styles.toolBtn, {backgroundColor: colors.status.negativeBg}]} accessibilityLabel="Delete question"><Ionicons name="trash" size={16} color={colors.status.negative} /></TouchableOpacity>
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
            style={{ position: 'absolute', right: 5, top: 5, backgroundColor: colors.accent.blue.bg, padding: 6, borderRadius: 8 }}
            onPress={() => setShowSnippetMenu(true)}
            disabled={isSnipping}
            accessibilityLabel="Add formula snippet"
          >
            {isSnipping ? <ActivityIndicator size="small" color={colors.primary.normal} /> : <Ionicons name="camera" size={18} color={colors.primary.normal} />}
          </TouchableOpacity>
        )}
      </View>

      {/* THE QUICK FORMAT TOOLBAR */}
      {!item.hideText && !isSelectMode && (
        <View ref={formatToolbarRef} collapsable={false} style={styles.formatToolbar}>
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
          {/* Dynamic Map over all options */}
          {(item.options || ["", "", "", ""]).map((opt, idx) => (
            <View key={idx} style={[styles.mcqOption, { marginBottom: 6, width: '100%' }]}>
              <Text style={styles.mcqLabel}>{String.fromCharCode(65 + idx)}</Text>
              <TextInput 
                style={[styles.mcqInput, { minHeight: 30 }]} 
                placeholder={`Option ${String.fromCharCode(65 + idx)}`} 
                value={opt} 
                onChangeText={t => updateOption(idx, t)} 
                editable={!isSelectMode}
                multiline
              />
              {/* DELETE OPTION BUTTON */}
              {!isSelectMode && (
                <TouchableOpacity onPress={() => {
                  const newOptions = [...(item.options || ["", "", "", ""])];
                  newOptions.splice(idx, 1);
                  onUpdate(sectionId, item.id, 'options', newOptions);
                }} style={{ padding: 8 }}>
                  <Ionicons name="close" size={18} color={colors.label.assistive} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          
          {/* ADD OPTION BUTTON */}
          {!isSelectMode && (
             <TouchableOpacity 
               onPress={() => {
                 const newOptions = [...(item.options || ["", "", "", ""])];
                 newOptions.push("");
                 onUpdate(sectionId, item.id, 'options', newOptions);
               }} 
               style={styles.addOptionBtn}
             >
               <Ionicons name="add" size={16} color={colors.primary.normal} />
               <Text style={styles.addOptionText}>Add Option</Text>
             </TouchableOpacity>
          )}
        </View>
      )}

      {/* DIAGRAM AREA */}
      {(!isInstruction) && (
        (!item.localUri || item.localUri === "NEEDS_CROP" ? (
          <TouchableOpacity 
            onPress={() => !isSelectMode && onPickDiagram(sectionId, item.id)} 
            style={[styles.addDiagramBtn, item.localUri === "NEEDS_CROP" && styles.addDiagramBtnHighlight]}
          >
             <Ionicons name={item.localUri === "NEEDS_CROP" ? "scan-outline" : "image-outline"} size={18} color={item.localUri === "NEEDS_CROP" ? colors.primary.normal : colors.label.alternative} />
             <Text style={[styles.addDiagramText, item.localUri === "NEEDS_CROP" && styles.addDiagramTextHighlight]}>
               {item.localUri === "NEEDS_CROP" ? "AI Detected Diagram (Tap to crop)" : "Add Diagram"}
             </Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Image source={{ uri: item.localUri }} style={[styles.qImage, item.hideText && {borderColor: colors.primary.normal, borderWidth:2}]} resizeMode="contain" />
             <View style={styles.diagramControl}>
               <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                  <Text style={styles.ctrlSub}>Settings</Text>
                  <View style={{flexDirection:'row', gap:8, alignItems: 'center'}}>
                    <TouchableOpacity onPress={() => !isSelectMode && onPickDiagram(sectionId, item.id)} style={{marginRight: 4}}>
                      <Ionicons name="crop" size={18} color={colors.primary.normal} />
                    </TouchableOpacity>
                    {(['S','M','L'] as const).map(sz => (
                      <TouchableOpacity key={sz} disabled={isSelectMode} onPress={() => onUpdate(sectionId, item.id, 'diagramSize', sz)} style={[styles.sizeBadge, currentSize === sz && styles.sizeBadgeActive]}>
                        <Text style={[styles.sizeText, currentSize === sz && styles.sizeTextActive]}>{sz}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{width:1, height:16, backgroundColor: colors.line.normal, marginHorizontal:2}} />
                    <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>HIDE</Text><Switch value={item.hideText} onValueChange={v => onUpdate(sectionId, item.id, 'hideText', v)} disabled={isSelectMode} trackColor={{false: colors.line.normal, true: colors.primary.normal}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                    <View style={{alignItems:'center'}}><Text style={{fontSize:8}}>FULL</Text><Switch value={item.isFullWidth} onValueChange={v => onUpdate(sectionId, item.id, 'isFullWidth', v)} disabled={isSelectMode} trackColor={{false: colors.line.normal, true: colors.primary.normal}} style={{transform:[{scaleX:.6},{scaleY:.6}]}}/></View>
                  </View>
               </View>
            </View>
          </View>
        ))
      )}

      {!isInstruction && (
        <View ref={qFooterRef} collapsable={false} style={styles.qFooter}><Text style={styles.markLabel}>Marks</Text><TextInput style={styles.markInput} value={item.marks} onChangeText={t => onUpdate(sectionId, item.id, 'marks', t)} keyboardType="numeric" placeholder="-" placeholderTextColor={colors.label.assistive} editable={!isSelectMode}/></View>
      )}

      {/* MOVE MODAL */}
      <Modal visible={showMoveMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowMoveMenu(false)} activeOpacity={1}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Move to Section</Text>
            {otherSections.map(s => (
              <TouchableOpacity key={s.id} style={styles.menuItem} onPress={() => { onMoveToSection(sectionId, item.id, s.id); setShowMoveMenu(false); }}>
                <Text style={styles.menuText}>{s.title}</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary.normal} />
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
                  <Ionicons name={opt.icon as any} size={18} color={item.type === opt.id ? colors.primary.normal : colors.label.alternative} />
                  <Text style={[styles.dropdownItemText, item.type === opt.id && styles.dropdownItemTextActive]}>
                    {opt.label}
                  </Text>
                </View>
                {/* The Checkmark for the currently selected option */}
                {item.type === opt.id && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary.normal} />
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
                <Ionicons name="camera" size={18} color={colors.label.alternative} />
                <Text style={styles.dropdownItemText}>Take Photo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dropdownItem} onPress={async () => {
              setShowSnippetMenu(false);
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true });
              processSnippet(result);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="images" size={18} color={colors.label.alternative} />
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
  isSelectMode, selectedIds, onToggleSelect, onRegisterSectionRef, onRegisterQuestionRefs
}: { 
  section: Section, index: number, 
  allSections: { id: string; title: string }[],
  onUpdateSection: (id: string, field: keyof Section, val: any) => void,
  onDeleteSection: (id: string) => void,
  onUpdateQ: any, onDeleteQ: any, onMoveQ: any, onAddQ: any, onPasteScan: any, onPickDiagram: any, onMoveToSection: any, onRescanSection: (secId: string, currentRescans?: number) => void,
  isSelectMode: boolean, selectedIds: Set<string>, onToggleSelect: (qId: string) => void,
  onRegisterSectionRef?: (ref: any) => void,
  onRegisterQuestionRefs?: (refs: { typeBadge: any; formatToolbar: any; qFooter: any }) => void,
}) => {
  const sectionToolsRef = useRef<any>(null);
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  useEffect(() => {
    if (onRegisterSectionRef) {
      const t = setTimeout(() => onRegisterSectionRef(sectionToolsRef.current), 200);
      return () => clearTimeout(t);
    }
  }, []);
  return (
  <View style={styles.sectionContainer}>
    <View style={styles.sectionHeader}>
      <TextInput style={styles.sectionTitleInput} value={section.title} onChangeText={t => onUpdateSection(section.id, 'title', t)} placeholder="Section Title" placeholderTextColor={colors.label.assistive} editable={!isSelectMode} />
      <View ref={sectionToolsRef} collapsable={false} style={styles.sectionTools}>
         <TouchableOpacity onPress={() => onUpdateSection(section.id, 'showDivider', !section.showDivider)} style={[styles.dividerBadge, section.showDivider && styles.dividerBadgeActive]} disabled={isSelectMode} accessibilityLabel="Toggle section divider">
            <Ionicons name="remove" size={14} color={section.showDivider ? colors.background.normal : colors.label.alternative} />
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onUpdateSection(section.id, 'layout', LAYOUT_CYCLE[section.layout] || '1-column')} style={[styles.layoutBadge, section.layout !== '1-column' && styles.layoutBadgeActive]} disabled={isSelectMode}>
            <Text style={[styles.layoutText, section.layout !== '1-column' && {color: colors.background.normal}]}>{LAYOUT_LABEL[section.layout] || '1 Col'}</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onRescanSection(section.id, section.rescanCount)} style={[styles.layoutBadge, { backgroundColor: colors.accent.blue.bgStrong }]} disabled={isSelectMode} accessibilityLabel="Rescan section">
            <Ionicons name="refresh" size={14} color={colors.primary.normal} />
         </TouchableOpacity>
         {section.sourceImageUri && (
           <TouchableOpacity onPress={() => setShowSourcePreview(true)} style={styles.sourceThumb}>
             <Image source={{ uri: section.sourceImageUri }} style={styles.sourceThumbImg} />
           </TouchableOpacity>
         )}
         <TouchableOpacity onPress={() => onDeleteSection(section.id)} style={styles.delSectionBtn} disabled={isSelectMode} accessibilityLabel="Delete section"><Ionicons name="close" size={16} color={colors.status.negative} /></TouchableOpacity>
      </View>
    </View>
    
    {section.questions.map((q, idx) => (
      <QuestionCard key={q.id} item={q} sectionId={section.id} allSections={allSections} onUpdate={onUpdateQ} onDelete={onDeleteQ} onMove={onMoveQ} onPickDiagram={onPickDiagram} onMoveToSection={onMoveToSection} isSelectMode={isSelectMode} isSelected={selectedIds.has(q.id)} onToggleSelect={onToggleSelect} onRegisterRefs={idx === 0 ? onRegisterQuestionRefs : undefined}/>
      ))}

    <View style={styles.sectionFooter}>
       <TouchableOpacity onPress={() => onPasteScan(section.id)} style={styles.secActionBtn} disabled={isSelectMode}><Ionicons name="camera" size={16} color={colors.primary.normal} /><Text style={styles.secActionText}>Scan</Text></TouchableOpacity>
       <TouchableOpacity onPress={() => onAddQ(section.id)} style={styles.secActionBtn} disabled={isSelectMode}><Ionicons name="add" size={16} color={colors.primary.normal} /><Text style={styles.secActionText}>Question</Text></TouchableOpacity>
    </View>

    {/* Source image full-screen preview */}
    <Modal visible={showSourcePreview} transparent animationType="fade">
      <View style={styles.sourcePreviewOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowSourcePreview(false)} activeOpacity={1} />
        <View style={styles.sourcePreviewContainer}>
          {section.sourceImageUri && (
            <Image source={{ uri: section.sourceImageUri }} style={styles.sourcePreviewImage} resizeMode="contain" />
          )}
          <TouchableOpacity onPress={() => setShowSourcePreview(false)} style={styles.sourcePreviewClose} accessibilityLabel="Close preview">
            <Ionicons name="close" size={24} color={colors.label.strong} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>
  );
});

// --- MAIN SCREEN ---

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const { alertState, showAlert, closeAlert } = useCustomAlert();
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
  const [fontTheme, setFontTheme] = useState<'modern' | 'times' | 'typewriter'>('modern');
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
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<'format' | 'layout' | 'tools'>('format');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // --- NEW: STOP LOSS STATE TRACKERS ---
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const latestState = useRef({ sections, header, fontTheme, currentProjectId });

  // --- SECTION NAVIGATOR ---
  const listRef = useRef<FlatList>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const navScrollRef = useRef<ScrollView>(null);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const first = viewableItems[0];
      if (first.index != null) setActiveSectionIndex(first.index);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number; highestMeasuredFrameIndex: number }) => {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, animated: true });
      }, 300);
    },
    [],
  );

  // --- SPOTLIGHT TOUR ---
  const [showTour, setShowTour] = useState(false);
  const tourBottomBarRef = useRef<any>(null);
  const tourToggleRef = useRef<any>(null);
  const tourGuideBtnRef = useRef<any>(null);
  const tourSubRefsMap = useRef<Record<string, React.RefObject<any>>>({});

  const registerTourQuestionRefs = useCallback((refs: { typeBadge: any; formatToolbar: any; qFooter: any }) => {
    if (refs.typeBadge && !tourSubRefsMap.current.typeBadge) {
      tourSubRefsMap.current.typeBadge = { current: refs.typeBadge };
    }
    if (refs.formatToolbar && !tourSubRefsMap.current.formatToolbar) {
      tourSubRefsMap.current.formatToolbar = { current: refs.formatToolbar };
    }
    if (refs.qFooter && !tourSubRefsMap.current.qFooter) {
      tourSubRefsMap.current.qFooter = { current: refs.qFooter };
    }
  }, []);

  const registerTourSectionRef = useCallback((ref: any) => {
    if (ref && !tourSubRefsMap.current.sectionTools) {
      tourSubRefsMap.current.sectionTools = { current: ref };
    }
  }, []);

  const getTourRefs = useCallback((): Record<string, React.RefObject<any>> => ({
    toggleContainer: tourToggleRef,
    guideBtn: tourGuideBtnRef,
    bottomBar: tourBottomBarRef,
    ...tourSubRefsMap.current,
  }), []);

  const handleTourFinish = useCallback(async () => {
    setShowTour(false);
    const settings = await getAppSettings();
    await saveAppSettings({ ...settings, hasSeenEditorTour: true });
  }, []);


  // Derived: lightweight section list for move-to-section picker
  const sectionList = React.useMemo(() => 
    sections.map(s => ({ id: s.id, title: s.title })), 
  [sections.length, sections.map(s => s.title).join()]);

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

      // THE FIX: Use your custom showAlert instead of Alert.alert
      showAlert(
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
            style: "default", // This will make it your brand Blue
            onPress: async () => {
              const { sections: s, header: h, fontTheme: f, currentProjectId: id } = latestState.current;
              
              const project = {
                id: id, title: h.title, updatedAt: Date.now(),
                header: h, sections: s, 
                settings: { fontTheme: f } 
              };
              
              await saveProject(project as any); 
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
              marks: (q.marks || "").toString(), localUri: q.localUri || q.diagramUri, 
              hideText: q.has_diagram ? true : false, isFullWidth: false, type: 'standard', options: []
            }));
            const newSection: Section = { id: Date.now().toString(), title: 'Section A', layout: '1-column', questions: formatted };
            setSections([newSection]);
            saveToDrafts([newSection], newHeader, appDefaults.defaultFontTheme);
          }
        } catch (e) { showAlert("Error", "Could not load scan data"); }
      }
    };
    init();
  }, [initialData, projectId]);

  // Auto-trigger tour on first editor open
  useEffect(() => {
    const checkTour = async () => {
      const settings = await getAppSettings();
      if (!settings.hasSeenEditorTour) {
        setTimeout(() => setShowTour(true), 900);
      }
    };
    checkTour();
  }, []);

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
    
    // THE PREMIUM FEEL: A light, satisfying vibration!
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    showAlert("Saved", "Draft updated successfully.");
  };

  const wrapForPreview = (html: string): string => {
    const previewCSS = `
      <style>
        @media screen {
          @page { size: auto; margin: 0; }
          html { background: ${colors.line.normal}; }
          body {
            background: ${colors.background.normal};
            width: 210mm;
            min-height: 297mm;
            margin: 12mm auto;
            padding: 15mm;
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border-radius: 2px;
          }
        }
      </style>
      <meta name="viewport" content="width=794, initial-scale=0.45, minimum-scale=0.3, maximum-scale=3.0, user-scalable=yes" />
    `;
    return html.replace('</head>', previewCSS + '</head>');
  };

  const handleTogglePreview = async () => {
    if (viewMode === 'edit') {
      setViewMode('preview');
      setIsGeneratingPreview(true);
      try {
        const html = await generateExamHtml(header, sections, fontTheme);
        setPreviewHtml(wrapForPreview(html));
      } finally {
        setIsGeneratingPreview(false);
      }
    } else {
      setViewMode('edit');
    }
  };

  const handleExport = async () => {
    try {
      await saveToDrafts(sections, header, fontTheme);
      const html = await generateExamHtml(header, sections, fontTheme);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      posthog?.capture('pdf_exported', {
        question_count: sections.reduce((n, s) => n + (s.questions?.length ?? 0), 0),
      });
      setExportedPdfUri(uri);
      setShowExportMenu(true);
    } catch (e) { showAlert("Export Failed", "Could not generate PDF."); }
  };

  const handleDownload = async () => {
    if (!exportedPdfUri) return;
    try {
      // NEW STANDARDIZED NAMING CONVENTION
      const cleanTitle = (header.title || 'Exam').trim().replace(/[^a-z0-9 \-]/gi, '');
      const cleanSubject = (header.className || 'Subject').trim().replace(/[^a-z0-9 \-]/gi, '');
      const dateStr = new Date().toISOString().split('T')[0]; 
      const fileName = `${cleanSubject} - ${cleanTitle} - ${dateStr}.pdf`;
      
      // Save to app internal folder first
      const docDir = FileSystem.documentDirectory + 'exams/';
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      const appUri = docDir + fileName;
      await FileSystem.copyAsync({ from: exportedPdfUri, to: appUri });
      
      // --- THE ANDROID PDF FIX ---
      if (Platform.OS === 'android') {
        try {
          // This opens the native Android file picker so the user can choose where to save it
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const base64 = await FileSystem.readAsStringAsync(appUri, { encoding: FileSystem.EncodingType.Base64 });
            const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/pdf');
            await FileSystem.writeAsStringAsync(createdUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            
            setShowExportMenu(false);
            setExportedPdfUri(null);
            showAlert("Success", "PDF saved to your folder!");
            return;
          }
        } catch (e) {
          console.warn("SAF Error:", e);
        }
      }

      // iOS Fallback (or if Android user canceled the folder selection)
      setShowExportMenu(false);
      setExportedPdfUri(null);
      await Sharing.shareAsync(appUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
    } catch (e) {
      showAlert("Download Failed", "Could not save PDF. Try Share instead.");
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
      showAlert("Share Failed", "Could not share PDF.");
    }
  };

  const toggleSelectQuestion = useCallback((qId: string) => {
    setSelectedIds(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(qId)) newSelected.delete(qId);
      else newSelected.add(qId);
      return newSelected;
    });
  }, []);

  // --- ACTIONS ---
  const addSection = () => setSections(prev => [...prev, { id: Date.now().toString(), title: "New Section", layout: '1-column', questions: [] }]);
  
  const updateSection = useCallback((id: string, field: keyof Section, value: any) => setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s)), []);
  
  const deleteSection = useCallback((id: string) => showAlert("Delete Section?", "Remove all questions?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => {
    setSections(prev => {
      const sec = prev.find(s => s.id === id);
      if (sec) {
        sec.questions.forEach(q => {
          if (q.localUri && !q.localUri.startsWith('data:image')) FileSystem.deleteAsync(q.localUri, { idempotent: true }).catch(()=>{});
        });
      }
      return prev.filter(s => s.id !== id);
    });
  } }]), [showAlert]);
  
  const updateQ = useCallback((secId: string, qId: string, field: any, value: any) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: s.questions.map(q => q.id === qId ? { ...q, [field]: value } : q) } : s)), []);
  
  // THE NEW DELETE WITH CONFIRMATION
  const deleteQ = useCallback((secId: string, qId: string) => {
    showAlert("Delete Question?", "Are you sure you want to remove this question?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
          setSections(prev => {
            const sec = prev.find(s => s.id === secId);
            if (sec) {
              const q = sec.questions.find(q => q.id === qId);
              if (q?.localUri && !q.localUri.startsWith('data:image')) {
                FileSystem.deleteAsync(q.localUri, { idempotent: true }).catch(()=>{});
              }
            }
            return prev.map(s => s.id === secId ? { ...s, questions: s.questions.filter(q => q.id !== qId) } : s);
          });
      }}
    ]);
  }, [showAlert]);

  const addQ = useCallback((secId: string) => setSections(prev => prev.map(s => s.id === secId ? { ...s, questions: [...s.questions, { id: Date.now().toString(), number: "", text: "", marks: "", type: 'standard', options:["","","",""] }] } : s)), []);
  
  const moveQ = useCallback((secId: string, qId: string, dir: 'up' | 'down') => {
    setSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const qs = [...s.questions];
      const idx = qs.findIndex(q => q.id === qId);
      if (idx === -1) return s;
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
  const handlePickDiagram = useCallback(async (secId: string, qId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        updateQ(secId, qId, 'localUri', result.assets[0].uri);
      }
    } catch (e) {
      showAlert("Error", "Could not pick image.");
    }
  }, [updateQ, showAlert]);

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
          showAlert("Scan Failed", "We couldn't detect any questions on this page. Please try taking a brighter photo.\n\n(No scan token was deducted).");
          return;
        }

        // Rule 2: Low Yield (1 or 2 questions)
        if (newQuestions.length <= 2 && !isRescan) {
          showAlert(
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
        
        const scannedUri = result.assets[0].uri;
        setSections(prev => prev.map(s => {
          if (s.id === secId) {
            return { 
              ...s, 
              rescanCount: isRescan ? (s.rescanCount || 0) + 1 : s.rescanCount,
              sourceImageUri: scannedUri,
              questions: isRescan ? newQuestions : [...s.questions, ...newQuestions] 
            };
          }
          return s;
        }));

      } catch (e) { 
        showAlert("Error", "Scan completely failed. No tokens were deducted."); 
      } finally { 
        setScanStatus(''); 
      }
    }
  };

  const handleScanToSection = useCallback(async (secId: string) => {
    const canScan = await checkScanEligibility();
    if (canScan) {
      setScanMenuConfig({ visible: true, sectionId: secId, isRescan: false });
    } else {
      setShowPaywall(true);
    }
  }, []);

  const handleRescanSection = useCallback((secId: string, currentRescans: number = 0) => {
    if (currentRescans >= 2) {
      showAlert("Free Rescans Exhausted", "You have used your 2 free rescans for this section. Scanning again will cost a regular token.", [
        { text: "Cancel", style: "cancel" },
        { text: "Use Token", onPress: () => handleScanToSection(secId) }
      ]);
    } else {
      setScanMenuConfig({ visible: true, sectionId: secId, isRescan: true });
    }
  }, [handleScanToSection, showAlert]);

  const renderSectionItem = useCallback(({ item, index }: { item: Section, index: number }) => (
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
        onRegisterSectionRef={index === 0 ? registerTourSectionRef : undefined}
        onRegisterQuestionRefs={index === 0 ? registerTourQuestionRefs : undefined}
    />
  ), [sectionList, updateSection, deleteSection, updateQ, deleteQ, moveQ, addQ, handleScanToSection, handlePickDiagram, moveToSection, handleRescanSection, isSelectMode, selectedIds, toggleSelectQuestion, registerTourSectionRef, registerTourQuestionRefs]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.alternative} />
      
      {/* HEADER NAV */}
      <View style={styles.nav}>
        {/* LEFT: Home Button */}
        {/* Added pointerEvents="box-none" so the invisible flex space doesn't steal taps */}
        <View style={{ flex: 1, alignItems: 'flex-start', zIndex: 10 }} pointerEvents="box-none">
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.navBack} accessibilityLabel="Home">
            <Ionicons name="home-outline" size={24} color={colors.label.normal} />
          </TouchableOpacity>
        </View>
        
        {/* CENTER */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', pointerEvents: 'box-none', zIndex: 20, gap: 12 }]}>
          
          {/* GUIDE BUTTON */}
          <TouchableOpacity 
            ref={tourGuideBtnRef}
            onPress={() => setShowFormatGuide(true)} 
            style={{ padding: 8, backgroundColor: colors.fill.normal, borderRadius: 20, pointerEvents: 'auto' }}
            accessibilityLabel="Format guide"
          >
            <Ionicons name="book-outline" size={20} color={colors.label.normal} />
          </TouchableOpacity>

          <View ref={tourToggleRef} collapsable={false} style={[styles.toggleContainer, { pointerEvents: 'auto' }]}>
             <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'edit' && styles.toggleActive]}>
                <Text style={[styles.toggleText, viewMode === 'edit' && styles.toggleTextActive]}>Edit</Text>
             </TouchableOpacity>
             <TouchableOpacity onPress={handleTogglePreview} style={[styles.toggleBtn, viewMode === 'preview' && styles.toggleActive]}>
                <Text style={[styles.toggleText, viewMode === 'preview' && styles.toggleTextActive]}>Preview</Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT: Tour + Select Mode */}
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6, zIndex: 10 }} pointerEvents="box-none">
          <TouchableOpacity onPress={() => setShowTour(true)} style={styles.saveBtn} accessibilityLabel="Feature tour">
            <Ionicons name="compass-outline" size={20} color={colors.label.normal} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()); }} style={[styles.saveBtn, isSelectMode && {backgroundColor: colors.primary.normal}]} accessibilityLabel="Select questions">
            <Ionicons name="checkbox-outline" size={20} color={isSelectMode ? colors.background.normal : colors.label.normal} />
          </TouchableOpacity>
        </View>
      </View>

      {/* SECTION NAVIGATOR */}
      {viewMode === 'edit' && sections.length > 1 && (
        <ScrollView
          ref={navScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionNav}
          contentContainerStyle={styles.sectionNavContent}
        >
          {sections.map((sec, i) => (
            <TouchableOpacity
              key={sec.id}
              onPress={() => {
                setActiveSectionIndex(i);
                listRef.current?.scrollToIndex({ index: i, animated: true });
              }}
              style={[styles.sectionNavChip, i === activeSectionIndex && styles.sectionNavChipActive]}
            >
              <Text
                style={[styles.sectionNavChipText, i === activeSectionIndex && styles.sectionNavChipTextActive]}
                numberOfLines={1}
              >
                {(sec.title || `Section ${i + 1}`).substring(0, 14)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* CONTENT AREA */}
      <View style={{ flex: 1 }}>
        {viewMode === 'edit' ? (
          // EDIT MODE
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined} 
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0} 
            style={{ flex: 1 }}
          >
            <FlatList 
                ref={listRef}
                data={sections} 
                keyExtractor={item => item.id} 
                
                automaticallyAdjustKeyboardInsets={true} 
                
                renderItem={renderSectionItem}
                
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScrollToIndexFailed={handleScrollToIndexFailed}
                
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={true}
                
                ListHeaderComponent={
                  <>
                    <HeaderEditor header={header} onChange={setHeader} />
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.fontBtn}>
                       <Text style={styles.fontBtnText}>Font: {fontTheme.toUpperCase()}</Text>
                       <Ionicons name="chevron-down" size={14} color={colors.label.alternative} />
                    </TouchableOpacity>
                  </>
                } 
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]} 
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
             {isGeneratingPreview ? (
               <View style={styles.previewLoading}>
                 <ActivityIndicator size="large" color={colors.primary.normal} />
                 <Text style={styles.previewLoadingText}>Generating preview…</Text>
               </View>
             ) : (
               <WebView 
                 originWhitelist={['*']} 
                 source={{ html: previewHtml }} 
                 style={{ flex: 1, backgroundColor: colors.line.normal }}
                 scalesPageToFit={false}
                 setBuiltInZoomControls={true}
                 setDisplayZoomControls={false}
                 allowsInlineMediaPlayback
               />
             )}
             <TouchableOpacity onPress={handleExport} style={[styles.fabPreview, { bottom: insets.bottom + 30 }]} accessibilityLabel="Export PDF">
                <Ionicons name="share-outline" size={24} color={colors.background.normal} />
                <Text style={styles.fabText}>Export PDF</Text>
             </TouchableOpacity>
          </View>
        )}
      </View>

      {/* STICKY BOTTOM ACTION BAR */}
      {viewMode === 'edit' && !isSelectMode && (
        <View ref={tourBottomBarRef} collapsable={false} style={styles.bottomBar}>
          <TouchableOpacity onPress={handleManualSave} style={styles.bottomBarBtn} disabled={isSaving} accessibilityLabel="Save draft">
            {isSaving ? <ActivityIndicator size="small" color={colors.label.alternative}/> : <Ionicons name="save-outline" size={22} color={colors.label.alternative} />}
            <Text style={styles.bottomBarText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => {
            const lastSecId = sections[sections.length - 1]?.id;
            if (lastSecId) {
              addQ(lastSecId);
            } else {
              addSection();
            }
          }} style={styles.bottomBarBtnPrimary}>
            <Ionicons name="add" size={22} color={colors.background.normal} />
            <Text style={styles.bottomBarTextPrimary}>Add Question</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleExport} style={styles.bottomBarBtn} accessibilityLabel="Export PDF">
            <Ionicons name="share-outline" size={22} color={colors.label.alternative} />
            <Text style={styles.bottomBarText}>Export</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* SCAN PROGRESS TRACKER OVERLAY */}
      {scanStatus !== '' && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>

            {/* Header */}
            <View style={styles.loadingHeader}>
              <View style={styles.loadingIconRing}>
                <ActivityIndicator size="small" color={colors.background.normal} />
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
                        ? <ActivityIndicator size="small" color={colors.background.normal} style={{ transform: [{ scale: 0.6 }] }} />
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
                { id: 'modern', label: 'Modern (Sans-Serif)' },
                { id: 'times', label: 'Times New Roman' },
                { id: 'typewriter', label: 'Typewriter' }
              ].map((f) => (
                <TouchableOpacity key={f.id} style={styles.menuItem} onPress={() => { setFontTheme(f.id as any); setShowSettings(false); }}>
                  <Text style={styles.menuText}>{f.label}</Text>
                  {fontTheme === f.id && <Ionicons name="checkmark" size={18} color={colors.primary.normal}/>}
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
                  <Ionicons name="download" size={32} color={colors.primary.normal} />
                </View>
                <Text style={styles.exportBtnText}>Download</Text>
                <Text style={styles.exportBtnSub}>Save to device</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="share-social" size={32} color={colors.primary.normal} />
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
                <Ionicons name="camera" size={18} color={colors.label.alternative} />
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
                <Ionicons name="images" size={18} color={colors.label.alternative} />
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
                  showAlert("Expo Go Mode", "Mock payment successful. Tokens added!");
                  return;
                }
                // ------------------

                const success = await purchaseScanPack('10_scans_pack');
                if (success) {
                  setShowPaywall(false);
                  showAlert("Payment Successful!", "10 Scans have been added to your account.");
                } else {
                  showAlert("Payment Failed", "Please try again later.");
                }
              }} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="add-circle" size={32} color={colors.primary.normal} />
                </View>
                <Text style={styles.exportBtnText}>10 Tokens</Text>
                <Text style={styles.exportBtnSub}>$2.99</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                // --- THE BYPASS ---
                if (Constants.appOwnership === 'expo') {
                  await purchaseTokens(50);
                  setShowPaywall(false);
                  showAlert("Expo Go Mode", "Mock payment successful. Tokens added!");
                  return;
                }
                // ------------------

                const success = await purchaseScanPack('50_scans');
                if (success) {
                  setShowPaywall(false);
                  showAlert("Payment Successful!", "50 Scans have been added to your account.");
                } else {
                  showAlert("Payment Failed", "Please try again later.");
                }
              }} style={styles.exportBtn}>
                <View style={styles.exportIconCircle}>
                  <Ionicons name="add-circle" size={32} color={colors.primary.normal} />
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
        <View style={[styles.bulkActionBar, { bottom: insets.bottom + 30 }]}>
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
                <Ionicons name="arrow-forward" size={14} color={colors.primary.normal} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MASTER EDITOR GUIDE MODAL */}
      <Modal visible={showFormatGuide} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.exportModal, { padding: 0, width: '90%', maxWidth: 420, overflow: 'hidden' }]}>
            
            {/* --- HEADER & TABS AREA --- */}
            <View style={{ padding: 20, paddingBottom: 16, backgroundColor: colors.accent.blue.bg, width: '100%', alignItems: 'center' }}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16}}>
                <Ionicons name="book" size={24} color={colors.primary.normal} />
                <Text style={[styles.exportTitle, {marginBottom: 0}]}>Editor Guide</Text>
              </View>
              
              {/* Custom Segmented Control */}
              <View style={{flexDirection: 'row', backgroundColor: colors.accent.blue.bgStrong, borderRadius: 10, padding: 4, width: '100%'}}>
                {(['format', 'layout', 'tools'] as const).map(tab => (
                  <TouchableOpacity 
                    key={tab} 
                    onPress={() => setGuideTab(tab)}
                    style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: guideTab === tab ? colors.background.normal : 'transparent', shadowColor: guideTab === tab ? '#000' : 'transparent', shadowOpacity: 0.1, shadowRadius: 2, elevation: guideTab === tab ? 2 : 0 }}
                  >
                    <Text style={{fontSize: 13, fontWeight: guideTab === tab ? '700' : '600', color: guideTab === tab ? colors.primary.strong : colors.primary.normal, textTransform: 'capitalize'}}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* --- CONTENT AREA --- */}
            <ScrollView style={{width: '100%', maxHeight: 400}} contentContainerStyle={{padding: 24}}>
              
              {/* TAB 1: FORMATTING */}
              {guideTab === 'format' && (
                <View style={{gap: 12}}>
                  <Text style={{fontSize: 14, color: colors.label.alternative, marginBottom: 12}}>Use these codes inside question boxes to style your text.</Text>
                  
                  <View style={styles.guideRow}>
                    <View style={styles.guideCode}><Text style={styles.guideCodeText}>**text**</Text></View>
                    <Ionicons name="arrow-forward" size={16} color={colors.interaction.inactive} />
                    <Text style={{fontSize: 15, fontWeight: 'bold', color: colors.label.normal}}>Bold text</Text>
                  </View>

                  <View style={styles.guideRow}>
                    <View style={styles.guideCode}><Text style={styles.guideCodeText}>*text*</Text></View>
                    <Ionicons name="arrow-forward" size={16} color={colors.interaction.inactive} />
                    <Text style={{fontSize: 15, fontStyle: 'italic', color: colors.label.normal}}>Italic text</Text>
                  </View>

                  <View style={styles.guideRow}>
                    <View style={styles.guideCode}><Text style={styles.guideCodeText}>\ce{'{H2O}'}</Text></View>
                    <Ionicons name="arrow-forward" size={16} color={colors.interaction.inactive} />
                    <Text style={{fontSize: 15, color: colors.label.normal, fontWeight: '600', letterSpacing: 0.5}}>H<Text style={{fontSize: 10, lineHeight: 18}}>2</Text>O</Text>
                  </View>

                  <View style={styles.guideRow}>
                    <View style={styles.guideCode}><Text style={styles.guideCodeText}>___</Text></View>
                    <Ionicons name="arrow-forward" size={16} color={colors.interaction.inactive} />
                    <Text style={{fontSize: 15, color: colors.label.normal}}>Fill in the _______</Text>
                  </View>
                </View>
              )}

              {/* TAB 2: LAYOUT */}
              {guideTab === 'layout' && (
                <View style={{gap: 20}}>
                   <Text style={{fontSize: 14, color: colors.label.alternative, marginBottom: 4}}>Control how your PDF looks on paper.</Text>
                   
                   <View style={styles.guideFeatureRow}>
                     <View style={[styles.layoutBadge, {backgroundColor: colors.label.normal}]}><Text style={{color: colors.background.normal, fontSize: 10, fontWeight: '700'}}>2 Col</Text></View>
                     <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Multi-Column Layout</Text><Text style={styles.guideFeatureDesc}>Tap this badge on a Section Header to pack more questions onto a single page using 2 or 3 columns.</Text></View>
                   </View>

                   <View style={styles.guideFeatureRow}>
                     <View style={[styles.dividerBadge, {backgroundColor: colors.label.normal}]}><Ionicons name="remove" size={14} color={colors.background.normal}/></View>
                     <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Section Dividers</Text><Text style={styles.guideFeatureDesc}>Tap the minus icon on a Section Header to draw a thick separator line above it.</Text></View>
                   </View>

                   <View style={styles.guideFeatureRow}>
                     <View style={styles.typeBadgeInstr}><Text style={{color: colors.background.normal, fontSize: 10, fontWeight: 'bold'}}>INSTR</Text></View>
                     <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Subheadings</Text><Text style={styles.guideFeatureDesc}>Change a question type to 'INSTR'. It removes the number and spans across all columns like a title.</Text></View>
                   </View>
                </View>
              )}

              {/* TAB 3: TOOLS */}
              {guideTab === 'tools' && (
                <View style={{gap: 20}}>
                  <Text style={{fontSize: 14, color: colors.label.alternative, marginBottom: 4}}>Advanced editing tools.</Text>
                  
                  <View style={styles.guideFeatureRow}>
                    <View style={{backgroundColor: colors.accent.blue.bgStrong, padding: 6, borderRadius: 8}}><Ionicons name="refresh" size={16} color={colors.primary.normal} /></View>
                    <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Rescan to Section</Text><Text style={styles.guideFeatureDesc}>Forgot a page? Tap this on a section to scan and automatically inject more questions directly into it.</Text></View>
                  </View>

                  <View style={styles.guideFeatureRow}>
                    <View style={{flexDirection: 'row', gap: 4}}>
                      <View style={styles.sizeBadge}><Text style={styles.sizeText}>S</Text></View>
                      <View style={[styles.sizeBadge, styles.sizeBadgeActive]}><Text style={styles.sizeTextActive}>M</Text></View>
                    </View>
                    <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Diagram Sizing</Text><Text style={styles.guideFeatureDesc}>Tap S/M/L on an image to control exactly how large the diagram prints on the final PDF.</Text></View>
                  </View>

                  <View style={styles.guideFeatureRow}>
                    <View style={{backgroundColor: colors.accent.blue.bg, padding: 6, borderRadius: 8}}><Ionicons name="swap-horizontal" size={16} color={colors.primary.normal} /></View>
                    <View style={{flex: 1}}><Text style={styles.guideFeatureTitle}>Moving Questions</Text><Text style={styles.guideFeatureDesc}>Use the arrows to reorder questions, or the blue swap icon to instantly move a question to another Section.</Text></View>
                  </View>
                </View>
              )}

            </ScrollView>

            {/* THE TRULY FIXED "GOT IT" BUTTON */}
            <TouchableOpacity 
              onPress={() => setShowFormatGuide(false)} 
              style={{
                backgroundColor: colors.primary.normal, 
                width: '90%', 
                alignSelf: 'center', 
                paddingVertical: spacing.lg, 
                borderRadius: radii.lg, 
                marginBottom: spacing.xl, 
                alignItems: 'center', 
                justifyContent: 'center'
              }}
            >
              <Text style={{ ...typography.heading4, color: colors.background.normal }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CustomAlert {...alertState} onClose={closeAlert} />

      {/* SPOTLIGHT TOUR */}
      <SpotlightTour
        steps={EDITOR_TOUR_STEPS}
        refs={getTourRefs()}
        visible={showTour}
        onFinish={handleTourFinish}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.alternative },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, backgroundColor: colors.background.normal, borderBottomWidth: 1, borderColor: colors.line.normal },
  navBack: { padding: 8 },
  
  toggleContainer: { flexDirection: 'row', backgroundColor: colors.fill.strong, borderRadius: radii.full, padding: 3 },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: radii.full },
  toggleActive: { backgroundColor: colors.background.normal, ...shadows.small },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.label.alternative },
  toggleTextActive: { color: colors.label.normal, fontWeight: '700' },

  saveBtn: { padding: 8, backgroundColor: colors.fill.normal, borderRadius: 20 },
  list: { padding: spacing.lg, paddingBottom: 100 },
  headerCard: { backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.xl, marginBottom: spacing.md, ...shadows.small },
  fontBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: colors.background.normal, borderRadius: radii.md, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.line.normal },
  fontBtnText: { fontSize: 12, fontWeight: '700', color: colors.label.alternative },

  schoolInput: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: colors.label.normal },
  titleInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: colors.label.alternative, marginBottom: 6 },
  classInput: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: colors.label.assistive, marginBottom: spacing.xl },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  metaBox: { flex: 1, backgroundColor: colors.background.alternative, padding: spacing.md, borderRadius: radii.sm },
  label: { fontSize: 10, fontWeight: '700', color: colors.label.assistive, marginBottom: 4 },
  metaInput: { fontSize: 14, fontWeight: '700', color: colors.label.normal },
  instructionBox: { backgroundColor: colors.accent.blue.bg, padding: spacing.md, borderRadius: radii.sm },
  instInput: { fontSize: 13, color: colors.primary.heavy, lineHeight: 20, minHeight: 40 },
  
  // SECTION NAVIGATOR
  sectionNav: { backgroundColor: colors.background.normal, borderBottomWidth: 1, borderColor: colors.line.normal, maxHeight: 44 },
  sectionNavContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  sectionNavChip: { height: 28, paddingHorizontal: 12, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line.normal, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.normal },
  sectionNavChipActive: { backgroundColor: colors.primary.normal, borderColor: colors.primary.normal },
  sectionNavChipText: { fontSize: 12, fontWeight: '600', color: colors.label.alternative },
  sectionNavChipTextActive: { color: colors.static.white, fontWeight: '700' },

  // SECTIONS
  sectionContainer: { marginBottom: spacing.xxl, borderLeftWidth: 3, borderLeftColor: colors.primary.normal, paddingLeft: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitleInput: { ...typography.heading4, color: colors.label.normal, flex: 1, paddingBottom: 4 },
  sectionTools: { flexDirection: 'row', gap: spacing.sm, marginLeft: spacing.md, alignItems: 'center' },
  dividerBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center' },
  dividerBadgeActive: { backgroundColor: colors.label.normal },
  layoutBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.md, backgroundColor: colors.fill.normal },
  layoutBadgeActive: { backgroundColor: colors.label.normal },
  layoutText: { fontSize: 10, fontWeight: '700', color: colors.label.alternative },
  delSectionBtn: { padding: 4 },
  sectionFooter: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md },
  secActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  secActionText: { fontSize: 12, color: colors.primary.normal, fontWeight: '600' },

  // SOURCE IMAGE PREVIEW
  sourceThumb: { width: 32, height: 32, borderRadius: radii.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.line.normal },
  sourceThumbImg: { width: '100%', height: '100%' },
  sourcePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  sourcePreviewContainer: { width: '92%', height: '80%', backgroundColor: colors.background.normal, borderRadius: radii.lg, overflow: 'hidden' },
  sourcePreviewImage: { width: '100%', height: '100%' },
  sourcePreviewClose: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 },

  // QUESTIONS
  qCard: { backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.small },
  qCardSelected: { backgroundColor: colors.accent.blue.bg, borderWidth: 2, borderColor: colors.primary.normal },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  numTag: { backgroundColor: colors.accent.blue.bg, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  numInput: { color: colors.accent.blue.text, fontWeight: 'bold', fontSize: 14, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.md, backgroundColor: colors.fill.normal, marginLeft: 8 },
  typeBadgeMCQ: { backgroundColor: colors.accent.purple.text },
  typeBadgeInstr: { backgroundColor: colors.accent.orange.text },
  typeText: { fontSize: 10, fontWeight: '800', color: colors.label.alternative },

  toolRow: { flexDirection: 'row', gap: 6 },
  toolBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center' },
  
  mcqContainer: { marginBottom: spacing.md },
  mcqRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  mcqOption: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.alternative, borderRadius: radii.sm, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.line.alternative },
  mcqLabel: { fontWeight: '800', color: colors.label.assistive, marginRight: 6, fontSize: 12 },
  mcqInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: colors.label.alternative },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, padding: 4 },
  addOptionText: { fontSize: 12, fontWeight: '600', color: colors.primary.normal },

  // DIAGRAM CROP UI
  addDiagramBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.background.alternative, borderWidth: 1, borderColor: colors.line.normal, borderStyle: 'dashed', borderRadius: radii.sm, padding: spacing.md, marginTop: 8, marginBottom: 8 },
  addDiagramBtnHighlight: { backgroundColor: colors.accent.blue.bg, borderColor: colors.accent.blue.bgStrong },
  addDiagramText: { fontSize: 12, fontWeight: '600', color: colors.label.alternative },
  addDiagramTextHighlight: { color: colors.primary.normal },

  diagramControl: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: radii.sm, marginBottom: 8, borderWidth: 1, borderColor: '#C8E6C9' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ctrlLabel: { fontSize: 12, fontWeight: '700', color: colors.status.positive, marginBottom: 8 },
  ctrlSub: { fontSize: 11, color: colors.status.positive },

  // SIZE BADGES
  sizeBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.fill.normal, justifyContent: 'center', alignItems: 'center' },
  sizeBadgeActive: { backgroundColor: colors.primary.normal },
  sizeText: { fontSize: 10, fontWeight: '800', color: colors.label.alternative },
  sizeTextActive: { color: colors.background.normal },

  qInput: { fontSize: 15, lineHeight: 22, color: colors.label.alternative, minHeight: 40, textAlignVertical: 'top' },
  dimmedInput: { opacity: 0.4, fontStyle: 'italic' },
  instructionInput: { fontWeight: '700', fontSize: 15, color: colors.label.normal },
  qImage: { width: '100%', height: 180, backgroundColor: colors.background.alternative, borderRadius: radii.sm, marginTop: spacing.md },
  qFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.line.alternative },
  markLabel: { fontSize: 12, color: colors.label.assistive, marginRight: 8 },
  markInput: { backgroundColor: colors.fill.normal, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, fontWeight: 'bold', minWidth: 40, textAlign: 'center', padding: 0, includeFontPadding: false },
  
  footerActions: { marginTop: spacing.xl, marginBottom: spacing.jumbo },
  addBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: spacing.lg, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.label.assistive, borderRadius: radii.md, backgroundColor: colors.fill.alternative },
  addText: { color: colors.label.alternative, fontWeight: '700' },

  // --- STICKY BOTTOM BAR ---
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.background.normal, borderTopWidth: 1, borderColor: colors.line.normal },
  bottomBarBtn: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm, width: 48 },
  bottomBarText: { fontSize: 10, fontWeight: '600', color: colors.label.alternative, marginTop: 2 },
  bottomBarBtnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary.normal, paddingVertical: 12, paddingHorizontal: spacing.xxl, borderRadius: radii.full, flex: 1, marginHorizontal: spacing.md, ...shadows.small },
  bottomBarTextPrimary: { color: colors.background.normal, fontWeight: 'bold', fontSize: 14, marginLeft: 6 },

  fabPreview: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: colors.label.normal, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg, borderRadius: radii.full, ...shadows.large },
  fabText: { color: colors.background.normal, fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  previewContainer: { flex: 1, backgroundColor: colors.line.neutral },
  previewLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.alternative },
  previewLoadingText: { ...typography.body, color: colors.label.alternative, marginTop: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  menu: { width: 240, backgroundColor: colors.background.normal, borderRadius: radii.lg, padding: spacing.sm, ...shadows.medium },
  menuTitle: { fontSize: 11, fontWeight: '700', color: colors.label.assistive, padding: spacing.sm, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radii.sm },
  menuText: { fontSize: 14, color: colors.label.normal, fontWeight: '500' },
  
  // --- Dropdown Menu Styles ---
  dropdownMenu: { backgroundColor: colors.background.normal, borderRadius: radii.xl, padding: spacing.lg, width: 280, ...shadows.large },
  dropdownTitle: { fontSize: 13, fontWeight: '700', color: colors.label.assistive, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md, paddingHorizontal: spacing.sm },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radii.sm, marginBottom: 4 },
  dropdownItemActive: { backgroundColor: colors.accent.blue.bg },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: colors.label.alternative },
  dropdownItemTextActive: { color: colors.primary.normal, fontWeight: '700' },
  
  // Export Modal
  exportModal: { width: '85%', backgroundColor: colors.background.normal, borderRadius: radii.xxl, padding: spacing.xxl, alignItems: 'center' },
  exportTitle: { ...typography.heading2, color: colors.label.normal, marginBottom: spacing.sm },
  exportSub: { fontSize: 14, color: colors.label.alternative, textAlign: 'center', marginBottom: spacing.xxl },
  exportButtons: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xl },
  exportBtn: { flex: 1, alignItems: 'center', backgroundColor: colors.background.alternative, borderRadius: radii.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.line.normal },
  exportIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent.blue.bg, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  exportBtnText: { ...typography.heading4, color: colors.label.normal, marginBottom: 4 },
  exportBtnSub: { fontSize: 12, color: colors.label.alternative },
  exportCancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  exportCancelText: { fontSize: 16, fontWeight: '600', color: colors.label.alternative },

  // --- Scan Progress Overlay ---
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  loadingBox: {
    backgroundColor: colors.background.normal, borderRadius: radii.xxl, padding: 28,
    width: 300, ...shadows.large,
  },
  loadingHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 24,
  },
  loadingIconRing: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary.normal,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  loadingTitle: {
    fontSize: 17, fontWeight: '800', color: colors.label.normal,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, position: 'relative',
  },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.line.normal,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, zIndex: 1,
  },
  stepDotActive: {
    backgroundColor: colors.primary.normal,
  },
  stepDotDone: {
    backgroundColor: colors.status.positive,
  },
  stepDotText: {
    fontSize: 11, fontWeight: '700', color: colors.label.assistive,
  },
  stepLabel: {
    fontSize: 14, fontWeight: '500', color: colors.label.assistive, flex: 1,
  },
  stepLabelActive: {
    color: colors.primary.normal, fontWeight: '700',
  },
  stepLabelDone: {
    color: colors.status.positive, fontWeight: '600',
  },
  stepConnector: {
    position: 'absolute', left: 13, top: 28,
    width: 2, height: 14, backgroundColor: colors.line.normal, zIndex: 0,
  },
  stepConnectorDone: {
    backgroundColor: colors.status.positive,
  },
  loadingStatusText: {
    marginTop: 12, fontSize: 12, color: colors.label.alternative,
    fontWeight: '500', textAlign: 'center',
  },

  // --- Bulk Action Bar Styles ---
  bulkActionBar: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: colors.label.normal, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radii.full, width: '80%', ...shadows.large },
  bulkActionText: { color: colors.background.normal, fontWeight: 'bold', fontSize: 16 },
  bulkActionBtn: { backgroundColor: colors.primary.normal, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.full },
  bulkActionBtnText: { color: colors.background.normal, fontWeight: '700', fontSize: 13 },

  // --- Quick Format Toolbar ---
  formatToolbar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: 4, paddingHorizontal: 2 },
  formatBtn: { backgroundColor: colors.fill.normal, paddingVertical: 6, paddingHorizontal: 14, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line.alternative },
  formatBtnText: { color: colors.label.alternative, fontSize: 13, fontWeight: '700' },

  // --- Format Guide Styles ---
  guideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background.alternative, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line.normal },
  guideCode: { backgroundColor: colors.fill.strong, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 80, alignItems: 'center' },
  guideCodeText: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, color: colors.label.alternative, fontWeight: '700' },

  // --- Editor Guide Styles ---
  guideFeatureRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  guideFeatureTitle: { ...typography.body, fontWeight: '800', color: colors.label.normal, marginBottom: 4 },
  guideFeatureDesc: { ...typography.bodySmall, color: colors.label.alternative, lineHeight: 20 },
});
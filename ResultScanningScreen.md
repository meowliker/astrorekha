import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Platform, Alert as RNAlert, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { palmReadingService } from '../services/palmReadingService';
import { readingStorageService } from '../services/readingStorageService';
import { personalDetailsService } from '../services/personalDetailsService';

const PalmReadingResultScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { imageData, timestamp, savedReading, readingId, readingTitle, readingCreatedAt } = route.params || {};
  
  const [reading, setReading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('ageTimeline');
  const [savedId, setSavedId] = useState(readingId || null);
  const [savedTitle, setSavedTitle] = useState(readingTitle || 'Palm Reading');
  const [savedAt, setSavedAt] = useState(readingCreatedAt || null);
  const [expandedCosmic, setExpandedCosmic] = useState(false);
  const analyzeReqIdRef = useRef(0);

  const getZodiacSign = (date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Pisces';
    return 'Unknown';
  };

  const tryParseReadingFromText = (text) => {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    const withoutFences = trimmed
      .replace(/^```(?:json|javascript|js)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const cleanupJson = (s) => (typeof s === 'string' ? s.replace(/,\s*(\}|\])/g, '$1') : s);
    const candidates = [withoutFences];
    const match = withoutFences.match(/\{[\s\S]*\}/);
    if (match && match[0]) candidates.push(match[0]);

    for (const raw of candidates) {
      try {
        let parsed = JSON.parse(cleanupJson(raw));
        if (typeof parsed === 'string') parsed = JSON.parse(cleanupJson(parsed.trim()));
        if (parsed && typeof parsed === 'object' && ('cosmicInsight' in parsed || 'tabs' in parsed || 'meta' in parsed)) {
          return parsed;
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  };


  useEffect(() => {
    const analyzePalm = async () => {
      const reqId = ++analyzeReqIdRef.current;
      try {
        setLoading(true);
        
        // Get actual user data from personal details storage
        let userBirthdate = null;
        let userZodiacSign = 'Unknown';
        
        try {
          const personalDetails = await personalDetailsService.getPersonalDetails();
          if (personalDetails?.dateOfBirth) {
            const dob = new Date(personalDetails.dateOfBirth);
            userBirthdate = dob.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            userZodiacSign = getZodiacSign(dob);
          }
        } catch (e) {
          console.log('Could not load personal details:', e);
        }
        
        // Fallback if no birthdate is set
        if (!userBirthdate) {
          userBirthdate = 'Not provided';
          userZodiacSign = 'Unknown';
        }
        
        console.log('Using user profile:', { birthdate: userBirthdate, zodiacSign: userZodiacSign });
        
        const result = await palmReadingService.analyzePalm(
          imageData,
          userBirthdate,
          userZodiacSign
        );

        // DEBUG: Log raw result from AI (summary only)
        console.log('=== PALM READING DEBUG ===');
        console.log('Raw result type:', typeof result);
        console.log('Has error:', result?.error);
        console.log('Has cosmicInsight:', !!result?.cosmicInsight);
        console.log('Has tabs:', !!result?.tabs);

        // Ignore late results from an older request
        if (reqId !== analyzeReqIdRef.current) return;

        // Try to parse result if it looks like a string or has embedded JSON
        let finalReading = result;
        if (typeof result === 'string') {
          console.log('Result is string, attempting to parse...');
          const parsed = tryParseReadingFromText(result);
          if (parsed) {
            console.log('Successfully parsed string to object');
            finalReading = parsed;
          } else {
            console.log('Failed to parse string as JSON');
          }
        }

        // DEBUG: Log final reading (summary only)
        console.log('Final reading keys:', finalReading ? Object.keys(finalReading) : 'null');
        console.log('Has cosmicInsight:', !!finalReading?.cosmicInsight);
        console.log('Has tabs:', !!finalReading?.tabs);

        // Check for NOT_A_PALM error first (non-palm image detection)
        const errorMessage = finalReading?.meta?.errorMessage || '';
        if (errorMessage.includes('NOT_A_PALM') || (finalReading?.tabs === null && errorMessage)) {
          console.log('Not a palm image detected');
          const userFriendlyError = errorMessage.replace('NOT_A_PALM: ', '') || 
            'Please upload a clear photo of your palm. The image provided does not appear to be a human hand.';
          setError(userFriendlyError);
          setReading(null);
          return;
        }

        // Check if result has cosmicInsight/tabs (valid reading)
        const isValidReading = finalReading && typeof finalReading === 'object' && 
          finalReading.tabs !== null && ('cosmicInsight' in finalReading || 'tabs' in finalReading);
        console.log('Is valid reading:', isValidReading);

        // Check for error or errorMessage
        const message = finalReading?.error ? finalReading.message : finalReading?.meta?.errorMessage;
        const parsedFromMessage = message ? tryParseReadingFromText(message) : null;

        if (parsedFromMessage) {
          console.log('Found reading in error message, using that');
          setReading(parsedFromMessage);
          setError(null);

          const created = timestamp ? new Date(timestamp).getTime() : Date.now();
          const saved = await readingStorageService.add({
            title: 'Palm Reading',
            createdAt: created,
            reading: parsedFromMessage,
          });

          if (reqId !== analyzeReqIdRef.current) return;
          setSavedId(saved.id);
          setSavedTitle(saved.title);
          setSavedAt(saved.createdAt);
          return;
        }

        if (finalReading?.error) {
          console.log('Result has error flag, message length:', finalReading.message?.length || 0);
          // Check if the message contains a valid reading (sometimes the reading is in the message field)
          if (finalReading.message && typeof finalReading.message === 'string') {
            const parsedFromError = tryParseReadingFromText(finalReading.message);
            if (parsedFromError && (parsedFromError.cosmicInsight || parsedFromError.tabs)) {
              console.log('Found valid reading inside error message, using it');
              setReading(parsedFromError);
              setError(null);
              
              const created = timestamp ? new Date(timestamp).getTime() : Date.now();
              const saved = await readingStorageService.add({
                title: 'Palm Reading',
                createdAt: created,
                reading: parsedFromError,
              });
              if (reqId !== analyzeReqIdRef.current) return;
              setSavedId(saved.id);
              setSavedTitle(saved.title);
              setSavedAt(saved.createdAt);
              return;
            }
          }
          // It's a real error
          setError(finalReading.message || 'An error occurred. Please try again.');
          setReading(null);
          return;
        }

        if (isValidReading) {
          console.log('Setting valid reading to state');
          setReading(finalReading);
          setError(null);

          const created = timestamp ? new Date(timestamp).getTime() : Date.now();
          const saved = await readingStorageService.add({
            title: 'Palm Reading',
            createdAt: created,
            reading: finalReading,
          });
          if (reqId !== analyzeReqIdRef.current) return;
          setSavedId(saved.id);
          setSavedTitle(saved.title);
          setSavedAt(saved.createdAt);
        } else {
          // Not a valid reading structure - show error only, not raw JSON
          console.log('Invalid reading structure, showing error');
          const errorMsg = finalReading?.meta?.errorMessage || 'Could not parse palm reading. Please try again with a clearer palm photo.';
          setError(errorMsg);
          setReading(null);
        }
      } catch (err) {
        if (reqId !== analyzeReqIdRef.current) return;
        setError(err.message);
        console.error('Palm reading analysis error:', err);
      } finally {
        if (reqId !== analyzeReqIdRef.current) return;
        setLoading(false);
      }
    };

    if (savedReading) {
      analyzeReqIdRef.current += 1;
      setReading(savedReading);
      setError(null);
      setLoading(false);
      return;
    }

    if (imageData) {
      analyzePalm();
    }
  }, [imageData, savedReading]);

  const handleBack = () => {
    navigation.navigate('Dashboard');
  };

  const handleShareReading = async () => {
    const shareText = reading
      ? `Cosmic Insight\n${reading.cosmicInsight || ''}`
      : 'Palm Reading';

    try {
      await Share.share({ message: shareText });
    } catch (err) {
      RNAlert.alert('Error', 'Failed to share reading');
    }
  };

  const handleDeleteReading = () => {
    RNAlert.alert(
      'Delete This Reading',
      'Are you sure you want to delete this reading?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (savedId) {
              await readingStorageService.remove(savedId);
            }
            handleBack();
          },
        },
      ]
    );
  };

  const renderTabButton = (key, label) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.tabButton, isActive && styles.tabButtonActive]}
        onPress={() => setActiveTab(key)}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderAgeTimeline = () => {
    const t = reading?.tabs?.ageTimeline;
    if (!t) return null;
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>📅 {t.title || 'Life Timeline Predictions'}</Text>
        {(t.stages || []).map((s, idx) => (
          <View key={`${s.range}-${idx}`} style={styles.stageBlock}>
            <View style={styles.stageHeaderRow}>
              <View style={styles.pill}><Text style={styles.pillText}>{s.range}</Text></View>
              <Text style={styles.stageLabel}>{s.label}</Text>
            </View>
            <Text style={styles.bodyText}>{s.description}</Text>
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.subHeader}>🕒 Key Life Milestones</Text>
        <View style={styles.bulletRow}><Text style={styles.bulletDot}>◉</Text><View style={styles.bulletContent}><Text style={styles.bulletTitle}>Wealth Peaks:</Text><Text style={styles.bulletText}>{t.milestones?.wealthPeaks}</Text></View></View>
        <View style={styles.bulletRow}><Text style={styles.bulletDot}>◉</Text><View style={styles.bulletContent}><Text style={styles.bulletTitle}>Health Events:</Text><Text style={styles.bulletText}>{t.milestones?.healthEvents}</Text></View></View>
        <View style={styles.bulletRow}><Text style={styles.bulletDot}>◉</Text><View style={styles.bulletContent}><Text style={styles.bulletTitle}>Life Line Ages:</Text><Text style={styles.bulletText}>{t.milestones?.lifeLineAges}</Text></View></View>
        <View style={styles.bulletRow}><Text style={styles.bulletDot}>◉</Text><View style={styles.bulletContent}><Text style={styles.bulletTitle}>Career Milestones:</Text><Text style={styles.bulletText}>{t.milestones?.careerMilestones}</Text></View></View>
        <View style={styles.bulletRow}><Text style={styles.bulletDot}>◉</Text><View style={styles.bulletContent}><Text style={styles.bulletTitle}>Relationship Timing:</Text><Text style={styles.bulletText}>{t.milestones?.relationshipTiming}</Text></View></View>
      </View>
    );
  };

  const renderWealth = () => {
    const t = reading?.tabs?.wealth;
    if (!t) return null;
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>📈 {t.title || 'Wealth & Financial Analysis'}</Text>
        <Text style={styles.subHeader}>$ Financial Potential</Text>
        <Text style={styles.bodyText}>{t.financialPotential?.level ? `${t.financialPotential.level}: ` : ''}{t.financialPotential?.details}</Text>
        <Text style={styles.subHeader}>↗ Business Aptitude</Text>
        <Text style={styles.bodyText}>{t.businessAptitude}</Text>
        <View style={styles.divider} />
        <Text style={styles.subHeader}>Wealth Timeline</Text>
        <Text style={styles.bodyText}>{t.wealthTimeline}</Text>
        <Text style={styles.subHeader}>Asset Accumulation</Text>
        <Text style={styles.bodyText}>{t.assetAccumulation}</Text>
        <Text style={styles.subHeader}>Money Management Style</Text>
        <Text style={styles.bodyText}>{t.moneyManagementStyle}</Text>
      </View>
    );
  };

  const renderMounts = () => {
    const t = reading?.tabs?.mounts;
    if (!t) return null;
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>👑 {t.title || 'Palm Mounts Analysis'}</Text>
        {(t.mounts || []).map((m, idx) => (
          <View key={`${m.name}-${idx}`} style={styles.mountBlock}>
            <Text style={styles.mountName}>✦ {m.name}</Text>
            <Text style={styles.bodyText}>{m.description}</Text>
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.sectionHeader}>📍 Line Intersections & Special Markings</Text>
        <Text style={styles.subHeader}>Travel Lines:</Text>
        <Text style={styles.bodyText}>{t.specialMarkings?.travelLines}</Text>
        <Text style={styles.subHeader}>Marriage Lines:</Text>
        <Text style={styles.bodyText}>{t.specialMarkings?.marriageLines}</Text>
        <Text style={styles.subHeader}>Health Indicators:</Text>
        <Text style={styles.bodyText}>{t.specialMarkings?.healthIndicators}</Text>
        <Text style={styles.subHeader}>Head Fate Intersection:</Text>
        <Text style={styles.bodyText}>{t.specialMarkings?.headFateIntersection}</Text>
        <Text style={styles.subHeader}>Life Heart Intersection:</Text>
        <Text style={styles.bodyText}>{t.specialMarkings?.lifeHeartIntersection}</Text>
      </View>
    );
  };

  const renderLove = () => {
    const t = reading?.tabs?.love;
    if (!t) return null;
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>❤️ {t.title || 'Love & Partnership Predictions'}</Text>
        <Text style={styles.subHeader}>👥 Partner Characteristics</Text>
        <Text style={styles.bodyText}>{t.partnerCharacteristics}</Text>
        <Text style={styles.subHeader}>🗓 Marriage Timing</Text>
        <Text style={styles.bodyText}>{t.marriageTiming}</Text>
        <View style={styles.divider} />
        <Text style={styles.subHeader}>Partner's Financial Status</Text>
        <Text style={styles.bodyText}>{t.partnersFinancialStatus}</Text>
        <Text style={styles.subHeader}>Relationship Challenges</Text>
        <Text style={styles.bodyText}>{t.relationshipChallenges}</Text>
        <Text style={styles.subHeader}>Family Predictions</Text>
        <Text style={styles.bodyText}>{t.familyPredictions}</Text>
      </View>
    );
  };

  const renderActiveTab = () => {
    if (!reading) return null;
    if (activeTab === 'ageTimeline') return renderAgeTimeline();
    if (activeTab === 'wealth') return renderWealth();
    if (activeTab === 'mounts') return renderMounts();
    if (activeTab === 'love') return renderLove();
    return null;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
        <LinearGradient
          colors={['#1a1a2e', '#0f0f1e', '#16213e']}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Analyzing your palm...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // If there's an error (like non-palm image), show only error screen
  if (error && !reading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
        <LinearGradient
          colors={['#1a1a2e', '#0f0f1e', '#16213e']}
          style={styles.gradient}
        >
          <View style={styles.errorScreenContainer}>
            <View style={styles.errorHeader}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.errorContentContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>Invalid Image</Text>
              <Text style={styles.errorMessage}>{error.replace(/NOT_A_PALM:\s*/i, '')}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      <LinearGradient
        colors={['#1a1a2e', '#0f0f1e', '#16213e']}
        style={styles.gradient}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Results</Text>
            <TouchableOpacity style={styles.headerRightButton} onPress={handleShareReading} activeOpacity={0.8}>
              <Text style={styles.headerRightButtonText}>Share</Text>
            </TouchableOpacity>
          </View>


          <View style={styles.contentPad}>
            <View style={styles.cosmicCard}>
              <View style={styles.cosmicHeaderRow}>
                <Text style={styles.cosmicTitle}>✦ Cosmic Insight</Text>
                <TouchableOpacity onPress={() => setExpandedCosmic((v) => !v)} activeOpacity={0.7}>
                  <Text style={styles.expandText}>{expandedCosmic ? 'Show less' : 'Show more'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cosmicText} numberOfLines={expandedCosmic ? undefined : 5}>
                {reading?.cosmicInsight || ''}
              </Text>
            </View>

            <View style={styles.tabsWrap}>
              {renderTabButton('ageTimeline', 'Age Timeline')}
              {renderTabButton('wealth', 'Wealth')}
              {renderTabButton('mounts', 'Mounts')}
              {renderTabButton('love', 'Love')}
            </View>

            {renderActiveTab()}

            <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteReading} activeOpacity={0.85}>
              <Text style={styles.deleteButtonText}>🗑  Delete This Reading</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  readingContainer: {
    paddingHorizontal: 20,
  },
  readingSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 16,
    color: '#e2e8f0',
    lineHeight: 24,
  },
  actionContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  saveButton: {
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  saveButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  newReadingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 25,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  newReadingButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorScreenContainer: {
    flex: 1,
  },
  errorHeader: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  errorContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#e2e8f0',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  aiMessageText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  aiMessageContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 12,
    padding: 16,
    marginVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  aiMessageIcon: {
    backgroundColor: '#ef4444',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aiMessageTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  headerRightButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  headerRightButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  contentPad: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  messageCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  messageTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  messageText: {
    color: '#e5e7eb',
    fontSize: 16,
    lineHeight: 24,
  },
  expandText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '700',
    paddingLeft: 12,
  },
  cosmicCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    marginBottom: 14,
  },
  cosmicHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cosmicTitle: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '800',
  },
  cosmicText: {
    color: '#e5e7eb',
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
  },
  tabsWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  tabButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  sectionCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.28)',
    marginBottom: 18,
  },
  sectionHeader: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 14,
  },
  subHeader: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  bodyText: {
    color: '#d1d5db',
    fontSize: 16,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginVertical: 16,
  },
  stageBlock: {
    marginBottom: 16,
  },
  stageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  pillText: {
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: '700',
  },
  stageLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bulletDot: {
    color: '#a855f7',
    fontSize: 14,
    marginRight: 10,
    marginTop: 2,
  },
  bulletContent: {
    flex: 1,
  },
  bulletTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  bulletText: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 23,
  },
  mountBlock: {
    marginBottom: 16,
  },
  mountName: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  deleteButton: {
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default PalmReadingResultScreen;



# Palm Reading Result – Claude Integration Spec (for my other project)

This document describes how to reproduce the **same palm reading results** and the **same organized JSON format** as my existing app, using **Claude only**.

## Goal

Given:
- A palm image (base64 + mime type)
- User birthdate (YYYY-MM-DD or "Not provided")
- User zodiac sign (string or "Unknown")

Return:
- A **single JSON object** that matches the exact schema below (no markdown, no extra text allowlisted).

---

## What Cascade should implement

- Build **one prompt** that:
  - Defines the role (“professional palm reader and astrologer”)
  - Enforces **strict JSON output**
  - Enforces **image validation rules** (lenient: analyze if any hand part is visible)
  - Enforces **depth requirements** (avoid generic output)
  - Contains the **exact schema** used by my PalmResult UI

- Send to Claude as:
  - `role: "user"`
  - `content: [{ type: "text", text: PROMPT + "\n\nPlease analyze..." }, { type: "image", source: { type: "base64", media_type, data } }]`

- Parse Claude response as JSON.
  - If parsing fails, return an error structure consistent with the schema (meta.errorMessage populated).

---

## Claude request (canonical)

### Model
Use the same model as my app:
- `claude-3-5-haiku-20241022`

### Max tokens
- `max_tokens: 3000`

### Messages structure
- Single message with `role: "user"`
- Content is an array: `text` + `image`

---

## Canonical PROMPT (copy exactly, only replace variables)

Replace:
- `${userBirthdate}`
- `${userZodiacSign}`

with actual values.

### Prompt text
You are a professional palm reader and astrologer with deep knowledge of palmistry, astrology, and cosmic insights.
Analyze the provided palm image and provide a comprehensive, highly detailed reading considering:
- Palm lines (heart, head, life, fate) and their depth/curvature/breaks
- Hand shape, finger length ratios, flexibility, thumb set
- Mount development (Venus, Luna, Mars, Jupiter, Saturn, Apollo, Mercury)
- User's birthdate: ${userBirthdate}
- User's zodiac sign: ${userZodiacSign}

DEPTH REQUIREMENTS (when analyzing):
- Be specific and concrete. Avoid generic statements.
- Each major field should be meaningfully detailed (aim for ~3-6 sentences per string field).
- Include practical, actionable advice where appropriate.
- If you are not fully certain, state it via meta.confidence and improvementTips, but still provide a best-effort reading.

CRITICAL - IMAGE VALIDATION:
- Be LENIENT when identifying palm images. If you see ANY part of a human hand (palm, fingers, wrist area), proceed with the reading.
- Only reject if the image is CLEARLY not a hand at all (e.g., landscape, animal, text, screenshot of UI, food, etc.)
- Blurry or partially visible palms should STILL be analyzed - just set a lower confidence score.
- If the image shows a hand from any angle (palm up, palm down, side view), attempt a reading.
- ONLY return the NOT_A_PALM error if you are 100% certain there is NO human hand in the image.
- When in doubt, ALWAYS attempt a reading with lower confidence rather than rejecting.

If the image IS suitable for analysis, return STRICT JSON with the following schema (no markdown, no extra text):

{
  "cosmicInsight": "string",
  "tabs": {
    "ageTimeline": {
      "title": "Life Timeline Predictions",
      "stages": [
        { "range": "string", "label": "string", "description": "string" }
      ],
      "milestones": {
        "wealthPeaks": "string",
        "healthEvents": "string",
        "lifeLineAges": "string",
        "careerMilestones": "string",
        "relationshipTiming": "string"
      }
    },
    "wealth": {
      "title": "Wealth & Financial Analysis",
      "financialPotential": { "level": "Low|Medium|Medium-High|High", "details": "string" },
      "businessAptitude": "string",
      "wealthTimeline": "string",
      "assetAccumulation": "string",
      "moneyManagementStyle": "string"
    },
    "mounts": {
      "title": "Palm Mounts Analysis",
      "mounts": [
        { "name": "Mount Of Luna", "description": "string" },
        { "name": "Mount Of Mars", "description": "string" },
        { "name": "Mount Of Venus", "description": "string" },
        { "name": "Mount Of Apollo", "description": "string" },
        { "name": "Mount Of Saturn", "description": "string" },
        { "name": "Mount Of Jupiter", "description": "string" },
        { "name": "Mount Of Mercury", "description": "string" }
      ],
      "specialMarkings": {
        "travelLines": "string",
        "marriageLines": "string",
        "healthIndicators": "string",
        "headFateIntersection": "string",
        "lifeHeartIntersection": "string"
      }
    },
    "love": {
      "title": "Love & Partnership Predictions",
      "partnerCharacteristics": "string",
      "marriageTiming": "string",
      "partnersFinancialStatus": "string",
      "relationshipChallenges": "string",
      "familyPredictions": "string"
    }
  },
  "meta": {
    "confidence": 0,
    "improvementTips": "string",
    "errorMessage": "string"
  }
}

If refusing (not a palm or insufficient), set all content strings empty, stages/mount arrays empty, set confidence to 0, and put the user-facing reason in meta.errorMessage.
If analyzing, meta.errorMessage must be an empty string.

AGE TIMELINE INSTRUCTION:
- Do NOT assume fixed life-phase labels like "Early Life" / "Prime Years".
- Choose 4-6 age ranges that best fit the palm indications you infer.
- For each stage:
  - range: a clear age range (e.g. "18-27", "28-35", "36-50", "51-65", "66+" etc.)
  - label: what that range represents for THIS person (e.g. "Foundation & Skill-Building", "Career Acceleration", "Recalibration", etc.)
  - description: detailed narrative of what the palm suggests happens in that period and why.

CONTENT STYLE:
- cosmicInsight: a vivid, specific summary that ties palm features + zodiac/birthdate influence.
- milestones fields: must be concrete (include approximate ages/ranges, and what to watch for or do).
- Avoid repetition across tabs: each tab should add new information.

### Extra instruction appended at send-time
After the above prompt text, append this line in the same text payload:
"Please analyze this palm image and provide a comprehensive reading."

(This matches my existing Claude call pattern.)

---

## Response parsing rules (must match UI expectations)

Claude returns:
- `response.content[0].text` as a string

You must:
1. Read the text.
2. Parse it as JSON.
3. If parsing fails:
   - Try removing code fences if present (```json ... ```).
   - Try extracting the largest `{ ... }` block.
   - Try removing trailing commas before `}` or `]`.
4. If still failing:
   - Return the schema with all strings empty and put the raw text into `meta.errorMessage`
   - Keep `meta.confidence = 0`

### Success definition
A “valid reading” is an object containing at least one of:
- `cosmicInsight`
- `tabs`
- `meta`

---

## Data required from app side

### Required inputs
- `imageBase64` (string, no data URL prefix)
- `mimeType` (e.g. `image/jpeg`, `image/png`)
- `userBirthdate` (YYYY-MM-DD or "Not provided")
- `userZodiacSign` ("Capricorn", etc. or "Unknown")

### Notes
- If user profile is missing, still call Claude with:
  - birthdate = "Not provided"
  - zodiacSign = "Unknown"

---

## Output invariants (do not change)

- Response is a single JSON object with keys:
  - `cosmicInsight`
  - `tabs.ageTimeline`, `tabs.wealth`, `tabs.mounts`, `tabs.love`
  - `meta.confidence`, `meta.improvementTips`, `meta.errorMessage`
- Titles must remain exactly as in schema (UI expects them).
- `meta.errorMessage`:
  - Must be `""` on success
  - Must contain a user-facing string on refusal / failure

---

## Quick checklist for Cascade

- [ ] Use Claude-only call with text+image content array
- [ ] Use the canonical prompt above (identity + rules + schema)
- [ ] Parse strictly into JSON
- [ ] On failure, return schema-compatible object with `meta.errorMessage`
- [ ] Keep keys and nesting exactly the same

---
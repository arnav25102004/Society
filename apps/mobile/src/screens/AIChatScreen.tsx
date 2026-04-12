/**
 * AI Resident Chatbot — "Ask SocietyHub"
 * 24/7 assistant with full context (dues, complaints, announcements).
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSizes } from '../theme';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
}

const QUICK_PROMPTS = [
  'What are my pending dues?',
  'Status of my latest complaint',
  'Any new announcements?',
  'When is the next maintenance due?',
];

export function AIChatScreen({ navigation }: any) {
  const { activeMembership, user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi ${user?.name?.split(' ')[0] ?? 'there'}! 👋 I'm SocietyBot, your 24/7 assistant for ${activeMembership?.societyName ?? 'your society'}.\n\nI can help you check dues, complaint status, announcements, and more. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !activeMembership) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim() };
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', isLoading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history = [...messages, userMsg]
        .filter(m => !m.isLoading)
        .map(m => ({ role: m.role, content: m.content }));

      const { data } = await api.post('/complaints/ai/chat', {
        messages: history,
        societyId: activeMembership.societyId,
      });

      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.reply,
      };
      setMessages(prev => [...prev.filter(m => m.id !== 'loading'), assistantMsg]);
    } catch {
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'loading'),
        { id: Date.now().toString(), role: 'assistant', content: 'Sorry, I\'m having trouble connecting. Please try again.' },
      ]);
    } finally {
      setIsTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, activeMembership]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>SocietyBot</Text>
            <Text style={styles.headerSub}>{isTyping ? 'Typing…' : 'Always online'}</Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => (
          <View style={[styles.msgRow, item.role === 'user' ? styles.msgRowUser : styles.msgRowBot]}>
            {item.role === 'assistant' && (
              <View style={styles.botBubbleAvatar}><Text>🤖</Text></View>
            )}
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
              {item.isLoading ? (
                <View style={styles.typingDots}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : (
                <Text style={[styles.bubbleText, item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextBot]}>
                  {item.content}
                </Text>
              )}
            </View>
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Quick prompts (only shown when < 3 messages) */}
      {messages.length <= 2 && (
        <View style={styles.quickPrompts}>
          <Text style={styles.quickLabel}>Try asking:</Text>
          <View style={styles.quickRow}>
            {QUICK_PROMPTS.map(prompt => (
              <Pressable key={prompt} style={styles.quickChip} onPress={() => sendMessage(prompt)}>
                <Text style={styles.quickChipText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask anything about your society…"
          placeholderTextColor={Colors.textDisabled}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(input)}
        />
        <Pressable
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
        >
          <MaterialCommunityIcons name="send" size={20} color={input.trim() ? Colors.primary : Colors.textDisabled} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.lg, paddingTop: 56, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  botAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  botAvatarText: { fontSize: 20 },
  headerTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: FontSizes.xs, color: Colors.secondary },

  messagesList: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.lg },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },

  botBubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },

  bubble: { maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.md },
  bubbleUser: {
    backgroundColor: Colors.primary, borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: Colors.surface, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  bubbleText: { fontSize: FontSizes.md, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextBot: { color: Colors.textPrimary },
  typingDots: { paddingVertical: 4 },

  quickPrompts: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  quickLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginBottom: 8 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  quickChipText: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceVariant, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSizes.md, color: Colors.textPrimary, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.surfaceVariant },
});

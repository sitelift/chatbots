import type { BusinessFacts, ChatbotAdminView, FaqPair } from '@sitelift/shared'
import { uid } from '../../lib/uid'

export interface EditableFaq extends FaqPair {
  _key: string
}

export interface EditableDomain {
  _key: string
  value: string
}

export interface FormState {
  name: string
  websiteUrl: string
  welcomeMessage: string
  brandColor: string
  avatarUrl: string
  quickReplies: string
  domains: EditableDomain[]
  status: ChatbotAdminView['status']
  facts: Omit<BusinessFacts, 'faqs'> & { faqs?: EditableFaq[] }
  model: string
  showLogo: boolean
  showName: boolean
  showOnlineStatus: boolean
  poweredBy: boolean
}

export type FormSetter = <K extends keyof FormState>(key: K, value: FormState[K]) => void

export function emptyFacts(): BusinessFacts & { faqs?: never[] } {
  return {
    overview: '',
    hours: '',
    location: '',
    contact: '',
    services: '',
    pricing: '',
    policies: '',
    misc: '',
    faqs: [],
  }
}

export function emptyForm(): FormState {
  return {
    name: '',
    websiteUrl: '',
    welcomeMessage: 'Hi! How can I help?',
    brandColor: '#18181b',
    avatarUrl: '',
    quickReplies: '',
    domains: [],
    status: 'active',
    facts: emptyFacts(),
    model: '',
    showLogo: true,
    showName: true,
    showOnlineStatus: true,
    poweredBy: true,
  }
}

export function toForm(v: ChatbotAdminView): FormState {
  return {
    name: v.name,
    websiteUrl: v.websiteUrl ?? '',
    welcomeMessage: v.welcomeMessage,
    brandColor: v.brandColor,
    avatarUrl: v.avatarUrl ?? '',
    quickReplies: v.quickReplies.join(', '),
    domains: (v.allowedDomains ?? []).map((d) => ({ _key: uid(), value: d })),
    status: v.status,
    facts: v.facts
      ? {
          ...emptyFacts(),
          ...v.facts,
          faqs: (v.facts.faqs ?? []).map((f) => ({ ...f, _key: uid() })),
        }
      : emptyFacts(),
    model: v.model ?? '',
    showLogo: v.showLogo,
    showName: v.showName,
    showOnlineStatus: v.showOnlineStatus,
    poweredBy: v.poweredBy,
  }
}

export function cleanFacts(facts: BusinessFacts): BusinessFacts {
  return {
    overview: facts.overview?.trim() || undefined,
    hours: facts.hours?.trim() || undefined,
    location: facts.location?.trim() || undefined,
    contact: facts.contact?.trim() || undefined,
    services: facts.services?.trim() || undefined,
    pricing: facts.pricing?.trim() || undefined,
    policies: facts.policies?.trim() || undefined,
    misc: facts.misc?.trim() || undefined,
    faqs: (facts.faqs ?? []).filter((f) => f.q.trim() && f.a.trim()),
  }
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

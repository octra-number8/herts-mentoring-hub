export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_grants: {
        Row: {
          account_id: string
          created_at: string
          entity_id: string
          entity_type: string
          expires_at: string | null
          granted_by: string | null
          id: string
          org_id: string
          reason: string
          revoked_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_id: string
          reason: string
          revoked_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_id?: string
          reason?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          org_id: string
          pinned: boolean
          published_at: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          pinned?: boolean
          published_at?: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          pinned?: boolean
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          active: boolean
          code: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          code: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          code?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          answers: Json
          attempt_no: number
          enrolment_id: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
          submitted_at: string
        }
        Insert: {
          answers: Json
          attempt_no: number
          enrolment_id: string
          id?: string
          lesson_id: string
          passed: boolean
          score: number
          submitted_at?: string
        }
        Update: {
          answers?: Json
          attempt_no?: number
          enrolment_id?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_learning_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_account_id: string | null
          actor_auth_id: string | null
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: number
          occurred_at: string
          org_id: string | null
        }
        Insert: {
          action: string
          actor_account_id?: string | null
          actor_auth_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          occurred_at?: string
          org_id?: string | null
        }
        Update: {
          action?: string
          actor_account_id?: string | null
          actor_auth_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          occurred_at?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_awards: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          org_id: string
          person_id: string
          source: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          org_id: string
          person_id: string
          source?: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          org_id?: string
          person_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "badge_awards_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_awards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_awards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_awards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          active: boolean
          criteria: Json
          description: string
          id: string
          key: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          criteria?: Json
          description: string
          id?: string
          key: string
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          criteria?: Json
          description?: string
          id?: string
          key?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feed_tokens: {
        Row: {
          account_id: string
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          org_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          org_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          org_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feed_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_feed_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          click_count: number
          delivered_at: string | null
          email: string
          error: string | null
          exclusion_reason: string | null
          first_clicked_at: string | null
          first_opened_at: string | null
          id: string
          name: string
          open_count: number
          person_id: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          unsubscribed_at: string | null
        }
        Insert: {
          campaign_id: string
          click_count?: number
          delivered_at?: string | null
          email: string
          error?: string | null
          exclusion_reason?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          name: string
          open_count?: number
          person_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Update: {
          campaign_id?: string
          click_count?: number
          delivered_at?: string | null
          email?: string
          error?: string | null
          exclusion_reason?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          name?: string
          open_count?: number
          person_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          attachments: Json
          audience: Json
          body_markdown: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          preheader: string | null
          recipient_count: number | null
          reply_to: string | null
          scheduled_for: string | null
          scope: string
          sent_at: string | null
          status: string
          subject: string
          submitted_at: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          audience?: Json
          body_markdown?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          preheader?: string | null
          recipient_count?: number | null
          reply_to?: string | null
          scheduled_for?: string | null
          scope?: string
          sent_at?: string | null
          status?: string
          subject: string
          submitted_at?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          audience?: Json
          body_markdown?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          preheader?: string | null
          recipient_count?: number | null
          reply_to?: string | null
          scheduled_for?: string | null
          scope?: string
          sent_at?: string | null
          status?: string
          subject?: string
          submitted_at?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          body: string | null
          case_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          kind: string
          org_id: string
          visible_to_requester: boolean
        }
        Insert: {
          body?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          kind: string
          org_id: string
          visible_to_requester?: boolean
        }
        Update: {
          body?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          kind?: string
          org_id?: string
          visible_to_requester?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          category_key: string
          closed_at: string | null
          created_at: string
          description: string | null
          due_on: string | null
          escalated_to_account_id: string | null
          id: string
          kind: string
          lodge_id: string | null
          member_person_id: string | null
          org_id: string
          outcome: string | null
          owner_account_id: string | null
          priority: string
          reference: string
          referred_to: string | null
          requester_account_id: string | null
          requester_person_id: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_key: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          due_on?: string | null
          escalated_to_account_id?: string | null
          id?: string
          kind?: string
          lodge_id?: string | null
          member_person_id?: string | null
          org_id: string
          outcome?: string | null
          owner_account_id?: string | null
          priority?: string
          reference?: string
          referred_to?: string | null
          requester_account_id?: string | null
          requester_person_id?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_key?: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          due_on?: string | null
          escalated_to_account_id?: string | null
          id?: string
          kind?: string
          lodge_id?: string | null
          member_person_id?: string | null
          org_id?: string
          outcome?: string | null
          owner_account_id?: string | null
          priority?: string
          reference?: string
          referred_to?: string | null
          requester_account_id?: string | null
          requester_person_id?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_escalated_to_account_id_fkey"
            columns: ["escalated_to_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_member_person_id_fkey"
            columns: ["member_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_member_person_id_fkey"
            columns: ["member_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_requester_account_id_fkey"
            columns: ["requester_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          completed_on: string
          course_id: string | null
          course_version_id: string | null
          enrolment_id: string | null
          event_id: string | null
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          learner_name: string
          org_id: string
          pathway_id: string | null
          person_id: string
          recognition_reason: string | null
          reference: string
          revoked_at: string | null
          revoked_reason: string | null
          storage_path: string | null
          title: string
        }
        Insert: {
          completed_on: string
          course_id?: string | null
          course_version_id?: string | null
          enrolment_id?: string | null
          event_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          learner_name: string
          org_id: string
          pathway_id?: string | null
          person_id: string
          recognition_reason?: string | null
          reference: string
          revoked_at?: string | null
          revoked_reason?: string | null
          storage_path?: string | null
          title: string
        }
        Update: {
          completed_on?: string
          course_id?: string | null
          course_version_id?: string | null
          enrolment_id?: string | null
          event_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          learner_name?: string
          org_id?: string
          pathway_id?: string | null
          person_id?: string
          recognition_reason?: string | null
          reference?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          storage_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_course_version_id_fkey"
            columns: ["course_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_learning_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_preferences: {
        Row: {
          email_status: string
          email_status_at: string | null
          events: boolean
          learning: boolean
          news: boolean
          org_id: string
          person_id: string
          unsubscribe_token: string
          unsubscribed_all_at: string | null
          updated_at: string
        }
        Insert: {
          email_status?: string
          email_status_at?: string | null
          events?: boolean
          learning?: boolean
          news?: boolean
          org_id: string
          person_id: string
          unsubscribe_token?: string
          unsubscribed_all_at?: string | null
          updated_at?: string
        }
        Update: {
          email_status?: string
          email_status_at?: string | null
          events?: boolean
          learning?: boolean
          news?: boolean
          org_id?: string
          person_id?: string
          unsubscribe_token?: string
          unsubscribed_all_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_change_requests: {
        Row: {
          created_at: string
          details: string
          handled_at: string | null
          handled_by: string | null
          handled_note: string | null
          id: string
          org_id: string
          person_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details: string
          handled_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          org_id: string
          person_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string
          handled_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          org_id?: string
          person_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_change_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_change_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_change_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          follow_up_on: string | null
          id: string
          lodge_id: string | null
          method: string
          occurred_on: string
          org_id: string
          outcome: string | null
          owner_account_id: string | null
          person_id: string | null
          shared_with_lodge: boolean
          summary: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          follow_up_on?: string | null
          id?: string
          lodge_id?: string | null
          method: string
          occurred_on?: string
          org_id: string
          outcome?: string | null
          owner_account_id?: string | null
          person_id?: string | null
          shared_with_lodge?: boolean
          summary: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          follow_up_on?: string | null
          id?: string
          lodge_id?: string | null
          method?: string
          occurred_on?: string
          org_id?: string
          outcome?: string | null
          owner_account_id?: string | null
          person_id?: string | null
          shared_with_lodge?: boolean
          summary?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          id: string
          position: number
          summary: string
          title: string
          version_id: string
        }
        Insert: {
          id?: string
          position: number
          summary?: string
          title: string
          version_id: string
        }
        Update: {
          id?: string
          position?: number
          summary?: string
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          certificate_enabled: boolean
          change_summary: string | null
          completion_rule: string
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          pass_mark: number
          published_at: string | null
          published_by: string | null
          review_note: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          version_no: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          certificate_enabled?: boolean
          change_summary?: string | null
          completion_rule?: string
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          pass_mark?: number
          published_at?: string | null
          published_by?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summary?: string
          title: string
          version_no: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          certificate_enabled?: boolean
          change_summary?: string | null
          completion_rule?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          pass_mark?: number
          published_at?: string | null
          published_by?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summary?: string
          title?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          archived_at: string | null
          audiences: string[]
          created_at: string
          estimated_minutes: number | null
          id: string
          image_path: string | null
          is_placeholder_content: boolean
          level: string
          masonic_stages: string[]
          org_id: string
          owner_account_id: string | null
          principle: string | null
          published_version_id: string | null
          slug: string
          summary: string
          title: string
          topics: string[]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audiences?: string[]
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          image_path?: string | null
          is_placeholder_content?: boolean
          level?: string
          masonic_stages?: string[]
          org_id: string
          owner_account_id?: string | null
          principle?: string | null
          published_version_id?: string | null
          slug: string
          summary?: string
          title: string
          topics?: string[]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audiences?: string[]
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          image_path?: string | null
          is_placeholder_content?: boolean
          level?: string
          masonic_stages?: string[]
          org_id?: string
          owner_account_id?: string | null
          principle?: string | null
          published_version_id?: string | null
          slug?: string
          summary?: string
          title?: string
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      degree_events: {
        Row: {
          created_at: string
          event_date: string
          id: string
          import_batch_id: string | null
          kind: string
          lodge_id: string | null
          org_id: string
          person_id: string
          source: string
        }
        Insert: {
          created_at?: string
          event_date: string
          id?: string
          import_batch_id?: string | null
          kind: string
          lodge_id?: string | null
          org_id: string
          person_id: string
          source?: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          import_batch_id?: string | null
          kind?: string
          lodge_id?: string | null
          org_id?: string
          person_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "degree_events_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degree_events_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degree_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degree_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degree_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      development_plan_items: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          kind: string
          notes: string | null
          plan_id: string
          position: number
          status: string
          target_on: string | null
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          plan_id: string
          position?: number
          status?: string
          target_on?: string | null
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          plan_id?: string
          position?: number
          status?: string
          target_on?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_plan_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "development_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      development_plans: {
        Row: {
          aspirations: string | null
          id: string
          org_id: string
          person_id: string
          updated_at: string
        }
        Insert: {
          aspirations?: string | null
          id?: string
          org_id: string
          person_id: string
          updated_at?: string
        }
        Update: {
          aspirations?: string | null
          id?: string
          org_id?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      document_acknowledgements: {
        Row: {
          acknowledged_at: string
          document_version_id: string
          person_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_version_id: string
          person_id: string
        }
        Update: {
          acknowledged_at?: string
          document_version_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgements_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acknowledgements_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acknowledgements_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          default_classification: string
          id: string
          key: string
          name: string
          org_id: string
          position: number
        }
        Insert: {
          default_classification?: string
          id?: string
          key: string
          name: string
          org_id: string
          position?: number
        }
        Update: {
          default_classification?: string
          id?: string
          key?: string
          name?: string
          org_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          change_summary: string | null
          created_at: string
          created_by: string | null
          document_id: string
          file_name: string | null
          id: string
          mime_type: string | null
          org_id: string
          published_at: string | null
          published_by: string | null
          review_note: string | null
          size_bytes: number | null
          status: string
          storage_path: string | null
          submitted_at: string | null
          version_label: string
          version_no: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          org_id: string
          published_at?: string | null
          published_by?: string | null
          review_note?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          submitted_at?: string | null
          version_label: string
          version_no: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          org_id?: string
          published_at?: string | null
          published_by?: string | null
          review_note?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          submitted_at?: string | null
          version_label?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          category_id: string | null
          classification: string
          created_at: string
          current_version_id: string | null
          id: string
          org_id: string
          owner_person_id: string | null
          reference: string
          renew_ack_on_revision: boolean
          requires_ack: boolean
          review_on: string | null
          search: unknown
          summary: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          classification?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          org_id: string
          owner_person_id?: string | null
          reference: string
          renew_ack_on_revision?: boolean
          requires_ack?: boolean
          review_on?: string | null
          search?: unknown
          summary?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          classification?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          org_id?: string
          owner_person_id?: string | null
          reference?: string
          renew_ack_on_revision?: boolean
          requires_ack?: boolean
          review_on?: string | null
          search?: unknown
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_account_id: string | null
          attempts: number
          entity_id: string | null
          entity_type: string | null
          id: string
          last_error: string | null
          occurred_at: string
          org_id: string
          payload: Json
          processed_at: string | null
          type: string
        }
        Insert: {
          actor_account_id?: string | null
          attempts?: number
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          occurred_at?: string
          org_id: string
          payload?: Json
          processed_at?: string | null
          type: string
        }
        Update: {
          actor_account_id?: string | null
          attempts?: number
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          occurred_at?: string
          org_id?: string
          payload?: Json
          processed_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          id: number
          occurred_at: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string | null
          provider_message_id: string | null
          type: string
        }
        Insert: {
          id?: never
          occurred_at?: string
          payload: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          type: string
        }
        Update: {
          id?: never
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          type?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attachments: Json
          attempts: number
          campaign_recipient_id: string | null
          category: string
          created_at: string
          html: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          org_id: string
          provider_message_id: string | null
          reply_to: string | null
          sent_at: string | null
          status: string
          subject: string
          text_body: string
          to_email: string
          to_person_id: string | null
        }
        Insert: {
          attachments?: Json
          attempts?: number
          campaign_recipient_id?: string | null
          category: string
          created_at?: string
          html: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          org_id: string
          provider_message_id?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          text_body: string
          to_email: string
          to_person_id?: string | null
        }
        Update: {
          attachments?: Json
          attempts?: number
          campaign_recipient_id?: string | null
          category?: string
          created_at?: string
          html?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          org_id?: string
          provider_message_id?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          text_body?: string
          to_email?: string
          to_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_markdown: string
          id: string
          is_system: boolean
          key: string
          kind: string
          name: string
          org_id: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_markdown: string
          id?: string
          is_system?: boolean
          key: string
          kind: string
          name: string
          org_id: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_markdown?: string
          id?: string
          is_system?: boolean
          key?: string
          kind?: string
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          course_id: string
          course_version_id: string
          due_on: string | null
          enrolled_at: string
          id: string
          last_activity_at: string | null
          org_id: string
          person_id: string
          source: string
          started_at: string | null
          status: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id: string
          course_version_id: string
          due_on?: string | null
          enrolled_at?: string
          id?: string
          last_activity_at?: string | null
          org_id: string
          person_id: string
          source?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id?: string
          course_version_id?: string
          due_on?: string | null
          enrolled_at?: string
          id?: string
          last_activity_at?: string | null
          org_id?: string
          person_id?: string
          source?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_course_version_id_fkey"
            columns: ["course_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checkin_secrets: {
        Row: {
          event_id: string
          rotated_at: string
          secret: string
        }
        Insert: {
          event_id: string
          rotated_at?: string
          secret?: string
        }
        Update: {
          event_id?: string
          rotated_at?: string
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkin_secrets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkin_secrets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_invites: {
        Row: {
          event_id: string
          invited_at: string
          person_id: string
        }
        Insert: {
          event_id: string
          invited_at?: string
          person_id: string
        }
        Update: {
          event_id?: string
          invited_at?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      event_joining_details: {
        Row: {
          event_id: string
          instructions: string | null
          online_url: string | null
        }
        Insert: {
          event_id: string
          instructions?: string | null
          online_url?: string | null
        }
        Update: {
          event_id?: string
          instructions?: string | null
          online_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_joining_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_joining_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_resources: {
        Row: {
          audience: string
          document_id: string | null
          event_id: string
          id: string
          position: number
          title: string
          url: string | null
        }
        Insert: {
          audience?: string
          document_id?: string | null
          event_id: string
          id?: string
          position?: number
          title: string
          url?: string | null
        }
        Update: {
          audience?: string
          document_id?: string | null
          event_id?: string
          id?: string
          position?: number
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_resources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_resources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_trainers: {
        Row: {
          display_name: string
          event_id: string
          person_id: string
          role: string
        }
        Insert: {
          display_name: string
          event_id: string
          person_id: string
          role?: string
        }
        Update: {
          display_name?: string
          event_id?: string
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_trainers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_trainers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_trainers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_trainers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendance_completes_course: boolean
          cancelled_reason: string | null
          capacity: number | null
          certificate_on_attendance: boolean
          checkin_open: boolean
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          external_booking_url: string | null
          external_provider: string | null
          external_ref: string | null
          feedback_enabled: boolean
          format: string
          id: string
          is_training: boolean
          kind: string
          location: string | null
          lodge_id: string | null
          meeting_centre_id: string | null
          org_id: string
          registration_closes_at: string | null
          registration_mode: string
          registration_opens_at: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          visibility: string
          waitlist_enabled: boolean
        }
        Insert: {
          attendance_completes_course?: boolean
          cancelled_reason?: string | null
          capacity?: number | null
          certificate_on_attendance?: boolean
          checkin_open?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          external_booking_url?: string | null
          external_provider?: string | null
          external_ref?: string | null
          feedback_enabled?: boolean
          format?: string
          id?: string
          is_training?: boolean
          kind: string
          location?: string | null
          lodge_id?: string | null
          meeting_centre_id?: string | null
          org_id: string
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
        }
        Update: {
          attendance_completes_course?: boolean
          cancelled_reason?: string | null
          capacity?: number | null
          certificate_on_attendance?: boolean
          checkin_open?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          external_booking_url?: string | null
          external_provider?: string | null
          external_ref?: string | null
          feedback_enabled?: boolean
          format?: string
          id?: string
          is_training?: boolean
          kind?: string
          location?: string | null
          lodge_id?: string | null
          meeting_centre_id?: string | null
          org_id?: string
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_meeting_centre_id_fkey"
            columns: ["meeting_centre_id"]
            isOneToOne: false
            referencedRelation: "meeting_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_booking_refs: {
        Row: {
          event_id: string
          external_booking_id: string
          external_status: string | null
          id: string
          org_id: string
          person_id: string | null
          provider: string
          synced_at: string
        }
        Insert: {
          event_id: string
          external_booking_id: string
          external_status?: string | null
          id?: string
          org_id: string
          person_id?: string | null
          provider: string
          synced_at?: string
        }
        Update: {
          event_id?: string
          external_booking_id?: string
          external_status?: string | null
          id?: string
          org_id?: string
          person_id?: string | null
          provider?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_booking_refs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_booking_refs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "external_booking_refs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_booking_refs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_booking_refs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      external_learning: {
        Row: {
          completed_on: string
          created_at: string
          evidence_path: string | null
          id: string
          org_id: string
          person_id: string
          provider: string
          self_declared: boolean
          title: string
          url: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          completed_on: string
          created_at?: string
          evidence_path?: string | null
          id?: string
          org_id: string
          person_id: string
          provider?: string
          self_declared?: boolean
          title: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          completed_on?: string
          created_at?: string
          evidence_path?: string | null
          id?: string
          org_id?: string
          person_id?: string
          provider?: string
          self_declared?: boolean
          title?: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_learning_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_learning_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_learning_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_learning_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_activations: {
        Row: {
          account_id: string | null
          actions: Json
          activated_by: string | null
          active: boolean
          created_at: string
          deactivated_at: string | null
          feature_key: string
          id: string
          lodge_id: string | null
          org_id: string
          reason: string
          role_id: string | null
          scope_type: string
        }
        Insert: {
          account_id?: string | null
          actions?: Json
          activated_by?: string | null
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          feature_key: string
          id?: string
          lodge_id?: string | null
          org_id: string
          reason?: string
          role_id?: string | null
          scope_type: string
        }
        Update: {
          account_id?: string | null
          actions?: Json
          activated_by?: string | null
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          feature_key?: string
          id?: string
          lodge_id?: string | null
          org_id?: string
          reason?: string
          role_id?: string | null
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_activations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_activations_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_activations_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "feature_activations_lodge_fk"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_activations_lodge_fk"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_activations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_activations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_settings: {
        Row: {
          actions: Json
          enabled: boolean
          feature_key: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: Json
          enabled?: boolean
          feature_key: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: Json
          enabled?: boolean
          feature_key?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_settings_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "feature_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          activation_mode: string
          description: string
          key: string
          name: string
        }
        Insert: {
          activation_mode: string
          description: string
          key: string
          name: string
        }
        Update: {
          activation_mode?: string
          description?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          committed_at: string | null
          created_at: string
          error: string | null
          file_name: string
          id: string
          is_partial: boolean
          org_id: string
          scope_lodge_ids: string[]
          source: string
          stats: Json
          status: string
          storage_path: string | null
          template_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          created_at?: string
          error?: string | null
          file_name: string
          id?: string
          is_partial?: boolean
          org_id: string
          scope_lodge_ids?: string[]
          source: string
          stats?: Json
          status?: string
          storage_path?: string | null
          template_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          created_at?: string
          error?: string | null
          file_name?: string
          id?: string
          is_partial?: boolean
          org_id?: string
          scope_lodge_ids?: string[]
          source?: string
          stats?: Json
          status?: string
          storage_path?: string | null
          template_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "import_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          applied_at: string | null
          batch_id: string
          candidate_person_ids: string[]
          data: Json
          decided_by: string | null
          decision: string
          decision_person_id: string | null
          diff: Json
          errors: Json
          id: string
          matched_person_id: string | null
          outcome: string
          raw: Json
          row_no: number
        }
        Insert: {
          applied_at?: string | null
          batch_id: string
          candidate_person_ids?: string[]
          data?: Json
          decided_by?: string | null
          decision?: string
          decision_person_id?: string | null
          diff?: Json
          errors?: Json
          id?: string
          matched_person_id?: string | null
          outcome: string
          raw: Json
          row_no: number
        }
        Update: {
          applied_at?: string | null
          batch_id?: string
          candidate_person_ids?: string[]
          data?: Json
          decided_by?: string | null
          decision?: string
          decision_person_id?: string | null
          diff?: Json
          errors?: Json
          id?: string
          matched_person_id?: string | null
          outcome?: string
          raw?: Json
          row_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_decision_person_id_fkey"
            columns: ["decision_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_decision_person_id_fkey"
            columns: ["decision_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_person_id_fkey"
            columns: ["matched_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_person_id_fkey"
            columns: ["matched_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      import_templates: {
        Row: {
          created_at: string
          created_by: string | null
          header_signature: string[] | null
          id: string
          mapping: Json
          name: string
          options: Json
          org_id: string
          report_kind: string
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          header_signature?: string[] | null
          id?: string
          mapping: Json
          name: string
          options?: Json
          org_id: string
          report_kind?: string
          source: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          header_signature?: string[] | null
          id?: string
          mapping?: Json
          name?: string
          options?: Json
          org_id?: string
          report_kind?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_failures: {
        Row: {
          context: Json
          id: string
          integration_key: string
          message: string
          occurred_at: string
          operation: string
          org_id: string
          resolved_at: string | null
          resolved_by: string | null
          retryable: boolean
        }
        Insert: {
          context?: Json
          id?: string
          integration_key: string
          message: string
          occurred_at?: string
          operation: string
          org_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          retryable?: boolean
        }
        Update: {
          context?: Json
          id?: string
          integration_key?: string
          message?: string
          occurred_at?: string
          operation?: string
          org_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          retryable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "integration_failures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_failures_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          key: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          notes: string | null
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          key: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          key?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          message: string | null
          org_id: string
          person_id: string
          revoked_at: string | null
          role_keys: string[]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          message?: string | null
          org_id: string
          person_id: string
          revoked_at?: string | null
          role_keys: string[]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          message?: string | null
          org_id?: string
          person_id?: string
          revoked_at?: string | null
          role_keys?: string[]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          anonymisation_confirmed: boolean
          approved_by: string | null
          audience: string
          author_account_id: string | null
          body_markdown: string
          created_at: string
          id: string
          kind: string
          org_id: string
          published_at: string | null
          search: unknown
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          anonymisation_confirmed?: boolean
          approved_by?: string | null
          audience?: string
          author_account_id?: string | null
          body_markdown: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
          published_at?: string | null
          search?: unknown
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          anonymisation_confirmed?: boolean
          approved_by?: string | null
          audience?: string
          author_account_id?: string | null
          body_markdown?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          published_at?: string | null
          search?: unknown
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_author_account_id_fkey"
            columns: ["author_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_profiles: {
        Row: {
          audiences: string[]
          interests: string[]
          masonic_stage: string | null
          org_id: string
          person_id: string
          updated_at: string
        }
        Insert: {
          audiences?: string[]
          interests?: string[]
          masonic_stage?: string | null
          org_id: string
          person_id: string
          updated_at?: string
        }
        Update: {
          audiences?: string[]
          interests?: string[]
          masonic_stage?: string | null
          org_id?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string
          enrolment_id: string
          lesson_id: string
        }
        Insert: {
          completed_at?: string
          enrolment_id: string
          lesson_id: string
        }
        Update: {
          completed_at?: string
          enrolment_id?: string
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_learning_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          estimated_minutes: number | null
          id: string
          is_assessment: boolean
          kind: string
          max_attempts: number | null
          module_id: string
          pass_mark: number | null
          position: number
          required: boolean
          title: string
        }
        Insert: {
          content?: Json
          estimated_minutes?: number | null
          id?: string
          is_assessment?: boolean
          kind?: string
          max_attempts?: number | null
          module_id: string
          pass_mark?: number | null
          position: number
          required?: boolean
          title: string
        }
        Update: {
          content?: Json
          estimated_minutes?: number | null
          id?: string
          is_assessment?: boolean
          kind?: string
          max_attempts?: number | null
          module_id?: string
          pass_mark?: number | null
          position?: number
          required?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_allocations: {
        Row: {
          area_id: string | null
          created_at: string
          ends_on: string | null
          id: string
          kind: string
          lodge_id: string
          org_id: string
          person_id: string
          reason: string | null
          recorded_by: string | null
          starts_on: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: string
          lodge_id: string
          org_id: string
          person_id: string
          reason?: string | null
          recorded_by?: string | null
          starts_on?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: string
          lodge_id?: string
          org_id?: string
          person_id?: string
          reason?: string | null
          recorded_by?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodge_allocations_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_allocations_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_appointments: {
        Row: {
          confirmed: boolean
          created_at: string
          ends_on: string | null
          id: string
          lodge_id: string
          office: string
          org_id: string
          person_id: string | null
          recorded_by: string | null
          source: string
          starts_on: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          ends_on?: string | null
          id?: string
          lodge_id: string
          office: string
          org_id: string
          person_id?: string | null
          recorded_by?: string | null
          source?: string
          starts_on?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          ends_on?: string | null
          id?: string
          lodge_id?: string
          office?: string
          org_id?: string
          person_id?: string | null
          recorded_by?: string | null
          source?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodge_appointments_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_appointments_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_appointments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_change_proposals: {
        Row: {
          changes: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          lodge_id: string
          note: string | null
          org_id: string
          proposed_by: string
          status: string
        }
        Insert: {
          changes: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          lodge_id: string
          note?: string | null
          org_id: string
          proposed_by: string
          status?: string
        }
        Update: {
          changes?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          lodge_id?: string
          note?: string | null
          org_id?: string
          proposed_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodge_change_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_change_proposals_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_change_proposals_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_change_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_change_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_memberships: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          join_type: string | null
          joined_on: string | null
          leaving_reason: string | null
          left_on: string | null
          lodge_id: string
          org_id: string
          person_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          join_type?: string | null
          joined_on?: string | null
          leaving_reason?: string | null
          left_on?: string | null
          lodge_id: string
          org_id: string
          person_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          join_type?: string | null
          joined_on?: string | null
          leaving_reason?: string | null
          left_on?: string | null
          lodge_id?: string
          org_id?: string
          person_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodge_memberships_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_memberships_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_mentoring_profiles: {
        Row: {
          arrangements: string | null
          good_practice: string | null
          guidance_used: string | null
          improvement_opportunities: string | null
          last_review_on: string | null
          lodge_id: string
          next_review_on: string | null
          org_id: string
          personal_mentors_for_new_members: string
          training_requirements: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arrangements?: string | null
          good_practice?: string | null
          guidance_used?: string | null
          improvement_opportunities?: string | null
          last_review_on?: string | null
          lodge_id: string
          next_review_on?: string | null
          org_id: string
          personal_mentors_for_new_members?: string
          training_requirements?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arrangements?: string | null
          good_practice?: string | null
          guidance_used?: string | null
          improvement_opportunities?: string | null
          last_review_on?: string | null
          lodge_id?: string
          next_review_on?: string | null
          org_id?: string
          personal_mentors_for_new_members?: string
          training_requirements?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodge_mentoring_profiles_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: true
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_mentoring_profiles_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: true
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_mentoring_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_mentoring_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_reviews: {
        Row: {
          created_at: string
          id: string
          lodge_id: string
          lodge_mentor_in_place: string | null
          next_review_on: string | null
          org_id: string
          personal_mentors_in_place: string | null
          review_date: string
          reviewed_by: string | null
          support_wanted: string | null
          training_needs: string | null
          what_is_working: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lodge_id: string
          lodge_mentor_in_place?: string | null
          next_review_on?: string | null
          org_id: string
          personal_mentors_in_place?: string | null
          review_date?: string
          reviewed_by?: string | null
          support_wanted?: string | null
          training_needs?: string | null
          what_is_working?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lodge_id?: string
          lodge_mentor_in_place?: string | null
          next_review_on?: string | null
          org_id?: string
          personal_mentors_in_place?: string | null
          review_date?: string
          reviewed_by?: string | null
          support_wanted?: string | null
          training_needs?: string | null
          what_is_working?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodge_reviews_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_reviews_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lodge_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          lodge_id: string
          note: string | null
          org_id: string
          previous_status_id: string | null
          status_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          lodge_id: string
          note?: string | null
          org_id: string
          previous_status_id?: string | null
          status_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          lodge_id?: string
          note?: string | null
          org_id?: string
          previous_status_id?: string | null
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodge_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_status_history_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_status_history_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_status_history_previous_status_id_fkey"
            columns: ["previous_status_id"]
            isOneToOne: false
            referencedRelation: "mentoring_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_status_history_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "mentoring_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      lodges: {
        Row: {
          created_at: string
          custom_fields: Json
          email: string | null
          id: string
          installation_month: number | null
          installation_note: string | null
          meeting_centre_id: string | null
          meeting_pattern: string | null
          membership_count: number | null
          membership_count_on: string | null
          mentoring_status_changed_at: string | null
          mentoring_status_id: string | null
          name: string
          number: number
          org_id: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          installation_month?: number | null
          installation_note?: string | null
          meeting_centre_id?: string | null
          meeting_pattern?: string | null
          membership_count?: number | null
          membership_count_on?: string | null
          mentoring_status_changed_at?: string | null
          mentoring_status_id?: string | null
          name: string
          number: number
          org_id: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          installation_month?: number | null
          installation_note?: string | null
          meeting_centre_id?: string | null
          meeting_pattern?: string | null
          membership_count?: number | null
          membership_count_on?: string | null
          mentoring_status_changed_at?: string | null
          mentoring_status_id?: string | null
          name?: string
          number?: number
          org_id?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodges_meeting_centre_id_fkey"
            columns: ["meeting_centre_id"]
            isOneToOne: false
            referencedRelation: "meeting_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodges_mentoring_status_id_fkey"
            columns: ["mentoring_status_id"]
            isOneToOne: false
            referencedRelation: "mentoring_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_agenda_items: {
        Row: {
          document_id: string | null
          document_url: string | null
          id: string
          meeting_id: string
          notes: string | null
          position: number
          presenter_person_id: string | null
          title: string
        }
        Insert: {
          document_id?: string | null
          document_url?: string | null
          id?: string
          meeting_id: string
          notes?: string | null
          position?: number
          presenter_person_id?: string | null
          title: string
        }
        Update: {
          document_id?: string | null
          document_url?: string | null
          id?: string
          meeting_id?: string
          notes?: string | null
          position?: number
          presenter_person_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_agenda_items_presenter_person_id_fkey"
            columns: ["presenter_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_agenda_items_presenter_person_id_fkey"
            columns: ["presenter_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          attendance: string
          meeting_id: string
          person_id: string
        }
        Insert: {
          attendance?: string
          meeting_id: string
          person_id: string
        }
        Update: {
          attendance?: string
          meeting_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_centres: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          postcode: string | null
          town: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          postcode?: string | null
          town?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          postcode?: string | null
          town?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_centres_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_decisions: {
        Row: {
          agenda_item_id: string | null
          created_at: string
          decision: string
          id: string
          meeting_id: string
          recorded_by: string | null
        }
        Insert: {
          agenda_item_id?: string | null
          created_at?: string
          decision: string
          id?: string
          meeting_id: string
          recorded_by?: string | null
        }
        Update: {
          agenda_item_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          meeting_id?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_decisions_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "meeting_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_decisions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: string
          location: string | null
          minutes: string | null
          minutes_approved_by: string | null
          minutes_status: string
          online_url: string | null
          org_id: string
          search: unknown
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          minutes?: string | null
          minutes_approved_by?: string | null
          minutes_status?: string
          online_url?: string | null
          org_id: string
          search?: unknown
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          minutes?: string | null
          minutes_approved_by?: string | null
          minutes_status?: string
          online_url?: string | null
          org_id?: string
          search?: unknown
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_minutes_approved_by_fkey"
            columns: ["minutes_approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_journeys: {
        Row: {
          created_at: string
          id: string
          journey_status: string
          learning_opt_in: boolean
          next_review_on: string | null
          org_id: string
          person_id: string
          personal_mentor_allocated: string
          personal_mentor_confirmed_by: string | null
          personal_mentor_confirmed_on: string | null
          personal_mentor_person_id: string | null
          personal_mentor_review_on: string | null
          royal_arch: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          journey_status?: string
          learning_opt_in?: boolean
          next_review_on?: string | null
          org_id: string
          person_id: string
          personal_mentor_allocated?: string
          personal_mentor_confirmed_by?: string | null
          personal_mentor_confirmed_on?: string | null
          personal_mentor_person_id?: string | null
          personal_mentor_review_on?: string | null
          royal_arch?: string
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          journey_status?: string
          learning_opt_in?: boolean
          next_review_on?: string | null
          org_id?: string
          person_id?: string
          personal_mentor_allocated?: string
          personal_mentor_confirmed_by?: string | null
          personal_mentor_confirmed_on?: string | null
          personal_mentor_person_id?: string | null
          personal_mentor_review_on?: string | null
          royal_arch?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_journeys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_personal_mentor_confirmed_by_fkey"
            columns: ["personal_mentor_confirmed_by"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_personal_mentor_confirmed_by_fkey"
            columns: ["personal_mentor_confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_personal_mentor_person_id_fkey"
            columns: ["personal_mentor_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_journeys_personal_mentor_person_id_fkey"
            columns: ["personal_mentor_person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      mentoring_statuses: {
        Row: {
          active: boolean
          description: string
          id: string
          is_closed: boolean
          key: string
          label: string
          org_id: string
          position: number
        }
        Insert: {
          active?: boolean
          description?: string
          id?: string
          is_closed?: boolean
          key: string
          label: string
          org_id: string
          position?: number
        }
        Update: {
          active?: boolean
          description?: string
          id?: string
          is_closed?: boolean
          key?: string
          label?: string
          org_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "mentoring_statuses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_mentions: {
        Row: {
          account_id: string
          note_id: string
        }
        Insert: {
          account_id: string
          note_id: string
        }
        Update: {
          account_id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_mentions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_mentions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          archived_at: string | null
          author_account_id: string
          body: string
          created_at: string
          id: string
          lodge_id: string | null
          org_id: string
          subject_id: string | null
          subject_type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          author_account_id?: string
          body: string
          created_at?: string
          id?: string
          lodge_id?: string | null
          org_id: string
          subject_id?: string | null
          subject_type: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          author_account_id?: string
          body?: string
          created_at?: string
          id?: string
          lodge_id?: string | null
          org_id?: string
          subject_id?: string | null
          subject_type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_author_account_id_fkey"
            columns: ["author_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          account_id: string
          channel: string
          type: string
        }
        Insert: {
          account_id: string
          channel: string
          type: string
        }
        Update: {
          account_id?: string
          channel?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          account_id: string
          body: string | null
          created_at: string
          dedupe_key: string | null
          digested_at: string | null
          emailed_at: string | null
          essential: boolean
          id: string
          link: string | null
          org_id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          account_id: string
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          digested_at?: string | null
          emailed_at?: string | null
          essential?: boolean
          id?: string
          link?: string | null
          org_id: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          account_id?: string
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          digested_at?: string | null
          emailed_at?: string | null
          essential?: boolean
          id?: string
          link?: string | null
          org_id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          branding: Json
          created_at: string
          id: string
          name: string
          settings: Json
          short_name: string
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          id?: string
          name: string
          settings?: Json
          short_name: string
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          short_name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pathway_courses: {
        Row: {
          course_id: string
          pathway_id: string
          position: number
          requirement: string
        }
        Insert: {
          course_id: string
          pathway_id: string
          position?: number
          requirement?: string
        }
        Update: {
          course_id?: string
          pathway_id?: string
          position?: number
          requirement?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathway_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathway_courses_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
        ]
      }
      pathways: {
        Row: {
          audience: string
          id: string
          org_id: string
          position: number
          published: boolean
          slug: string
          summary: string
          title: string
        }
        Insert: {
          audience: string
          id?: string
          org_id: string
          position?: number
          published?: boolean
          slug: string
          summary?: string
          title: string
        }
        Update: {
          audience?: string
          id?: string
          org_id?: string
          position?: number
          published?: boolean
          slug?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathways_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_grants: {
        Row: {
          account_id: string
          created_at: string
          ends_on: string | null
          granted_by: string | null
          id: string
          is_override: boolean
          org_id: string
          permission_key: string
          reason: string
          starts_on: string
        }
        Insert: {
          account_id: string
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          is_override?: boolean
          org_id: string
          permission_key: string
          reason: string
          starts_on?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          is_override?: boolean
          org_id?: string
          permission_key?: string
          reason?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_grants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          description: string
          feature_key: string
          key: string
        }
        Insert: {
          action: string
          description: string
          feature_key: string
          key: string
        }
        Update: {
          action?: string
          description?: string
          feature_key?: string
          key?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
        ]
      }
      persons: {
        Row: {
          anonymised_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string
          id: string
          is_restricted: boolean
          last_name: string
          local_corrections: Json
          membership_number: string | null
          org_id: string
          phone: string | null
          source: string
          status: string
          status_changed_on: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          anonymised_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_restricted?: boolean
          last_name: string
          local_corrections?: Json
          membership_number?: string | null
          org_id: string
          phone?: string | null
          source?: string
          status?: string
          status_changed_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          anonymised_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_restricted?: boolean
          last_name?: string
          local_corrections?: Json
          membership_number?: string | null
          org_id?: string
          phone?: string | null
          source?: string
          status?: string
          status_changed_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      provincial_appointments: {
        Row: {
          area_id: string | null
          created_at: string
          ends_on: string | null
          id: string
          office: string
          org_id: string
          person_id: string
          starts_on: string
          title: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          office: string
          org_id: string
          person_id: string
          starts_on?: string
          title?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          office?: string
          org_id?: string
          person_id?: string
          starts_on?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provincial_appointments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provincial_appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provincial_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provincial_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      quarterly_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string
          generated_by: string | null
          id: string
          narrative: Json
          observations: string | null
          org_id: string
          published_at: string | null
          quarter: number
          snapshot_id: string | null
          status: string
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          narrative?: Json
          observations?: string | null
          org_id: string
          published_at?: string | null
          quarter: number
          snapshot_id?: string | null
          status?: string
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          narrative?: Json
          observations?: string | null
          org_id?: string
          published_at?: string | null
          quarter?: number
          snapshot_id?: string | null
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarterly_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarterly_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarterly_reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      question_keys: {
        Row: {
          correct: Json
          explanation: string | null
          feedback_correct: string | null
          feedback_incorrect: string | null
          question_id: string
        }
        Insert: {
          correct: Json
          explanation?: string | null
          feedback_correct?: string | null
          feedback_incorrect?: string | null
          question_id: string
        }
        Update: {
          correct?: Json
          explanation?: string | null
          feedback_correct?: string | null
          feedback_incorrect?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          id: string
          kind: string
          lesson_id: string
          options: Json
          position: number
          prompt: string
        }
        Insert: {
          id?: string
          kind?: string
          lesson_id: string
          options: Json
          position: number
          prompt: string
        }
        Update: {
          id?: string
          kind?: string
          lesson_id?: string
          options?: Json
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      reflections: {
        Row: {
          created_at: string
          enrolment_id: string | null
          id: string
          lesson_id: string
          person_id: string
          response: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrolment_id?: string | null
          id?: string
          lesson_id: string
          person_id: string
          response: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrolment_id?: string | null
          id?: string
          lesson_id?: string
          person_id?: string
          response?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reflections_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflections_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_learning_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflections_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflections_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflections_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          cancelled_at: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkin_code: string
          checkin_method: string | null
          event_id: string
          feedback_at: string | null
          feedback_comment: string | null
          feedback_rating: number | null
          follow_up_sent_at: string | null
          id: string
          org_id: string
          override_reason: string | null
          person_id: string
          registered_at: string
          reminder_sent_at: string | null
          status: string
          waitlist_position: number | null
        }
        Insert: {
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_code?: string
          checkin_method?: string | null
          event_id: string
          feedback_at?: string | null
          feedback_comment?: string | null
          feedback_rating?: number | null
          follow_up_sent_at?: string | null
          id?: string
          org_id: string
          override_reason?: string | null
          person_id: string
          registered_at?: string
          reminder_sent_at?: string | null
          status: string
          waitlist_position?: number | null
        }
        Update: {
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_code?: string
          checkin_method?: string | null
          event_id?: string
          feedback_at?: string | null
          feedback_comment?: string | null
          feedback_rating?: number | null
          follow_up_sent_at?: string | null
          id?: string
          org_id?: string
          override_reason?: string | null
          person_id?: string
          registered_at?: string
          reminder_sent_at?: string | null
          status?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_attendance"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          kind: string
          org_id: string
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          kind: string
          org_id: string
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          kind?: string
          org_id?: string
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          action: string
          basis: string
          enabled: boolean
          entity_type: string
          id: string
          org_id: string
          retain_months: number
        }
        Insert: {
          action: string
          basis: string
          enabled?: boolean
          entity_type: string
          id?: string
          org_id: string
          retain_months: number
        }
        Update: {
          action?: string
          basis?: string
          enabled?: boolean
          entity_type?: string
          id?: string
          org_id?: string
          retain_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_runs: {
        Row: {
          affected: number
          details: Json
          dry_run: boolean
          id: string
          org_id: string
          policy_id: string | null
          run_at: string
          run_by: string | null
        }
        Insert: {
          affected: number
          details?: Json
          dry_run: boolean
          id?: string
          org_id: string
          policy_id?: string | null
          run_at?: string
          run_by?: string | null
        }
        Update: {
          affected?: number
          details?: Json
          dry_run?: boolean
          id?: string
          org_id?: string
          policy_id?: string | null
          run_at?: string
          run_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "retention_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          account_id: string
          created_at: string
          ends_on: string | null
          granted_by: string | null
          id: string
          org_id: string
          reason: string | null
          role_id: string
          starts_on: string
        }
        Insert: {
          account_id: string
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          org_id: string
          reason?: string | null
          role_id: string
          starts_on?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          role_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string
          id: string
          is_management: boolean
          is_system: boolean
          key: string
          name: string
          org_id: string
        }
        Insert: {
          description?: string
          id?: string
          is_management?: boolean
          is_system?: boolean
          key: string
          name: string
          org_id: string
        }
        Update: {
          description?: string
          id?: string
          is_management?: boolean
          is_system?: boolean
          key?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          config: Json
          created_at: string
          dataset: string
          id: string
          last_run_at: string | null
          name: string
          org_id: string
          owner_account_id: string
          schedule: string
          shared: boolean
        }
        Insert: {
          config: Json
          created_at?: string
          dataset: string
          id?: string
          last_run_at?: string | null
          name: string
          org_id: string
          owner_account_id?: string
          schedule?: string
          shared?: boolean
        }
        Update: {
          config?: Json
          created_at?: string
          dataset?: string
          id?: string
          last_run_at?: string | null
          name?: string
          org_id?: string
          owner_account_id?: string
          schedule?: string
          shared?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          account_id: string
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          org_id: string
          page: string
        }
        Insert: {
          account_id?: string
          created_at?: string
          filters: Json
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          page: string
        }
        Update: {
          account_id?: string
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          page?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          name: string
          org_id: string
          shared: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          id?: string
          name: string
          org_id: string
          shared?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          name?: string
          org_id?: string
          shared?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      solomon_resources: {
        Row: {
          course_id: string | null
          description: string
          id: string
          org_id: string
          pathway_id: string | null
          position: number
          title: string
          topics: string[]
          url: string
        }
        Insert: {
          course_id?: string | null
          description?: string
          id?: string
          org_id: string
          pathway_id?: string | null
          position?: number
          title: string
          topics?: string[]
          url: string
        }
        Update: {
          course_id?: string | null
          description?: string
          id?: string
          org_id?: string
          pathway_id?: string | null
          position?: number
          title?: string
          topics?: string[]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "solomon_resources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solomon_resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solomon_resources_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
        ]
      }
      support_categories: {
        Row: {
          active: boolean
          default_due_days: number
          description: string
          id: string
          key: string
          label: string
          org_id: string
          position: number
        }
        Insert: {
          active?: boolean
          default_due_days?: number
          description?: string
          id?: string
          key: string
          label: string
          org_id: string
          position?: number
        }
        Update: {
          active?: boolean
          default_due_days?: number
          description?: string
          id?: string
          key?: string
          label?: string
          org_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          task_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          task_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          id: string
          linked_id: string | null
          linked_type: string | null
          lodge_id: string | null
          org_id: string
          owner_account_id: string | null
          priority: string
          reminder_sent_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          lodge_id?: string | null
          org_id: string
          owner_account_id?: string | null
          priority?: string
          reminder_sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          lodge_id?: string | null
          org_id?: string
          owner_account_id?: string | null
          priority?: string
          reminder_sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_accounts: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          last_sign_in_at: string | null
          mfa_required: boolean
          org_id: string
          person_id: string
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          last_sign_in_at?: string | null
          mfa_required?: boolean
          org_id: string
          person_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          last_sign_in_at?: string | null
          mfa_required?: boolean
          org_id?: string
          person_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_participants: {
        Row: {
          person_id: string
          role: string
          visit_id: string
        }
        Insert: {
          person_id: string
          role?: string
          visit_id: string
        }
        Update: {
          person_id?: string
          role?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_participants_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          calendar_event_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          follow_up: string | null
          id: string
          lodge_id: string
          notes: string | null
          org_id: string
          outcome: string | null
          planned_for: string
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up?: string | null
          id?: string
          lodge_id: string
          notes?: string | null
          org_id: string
          outcome?: string | null
          planned_for: string
          purpose: string
          status?: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up?: string | null
          id?: string
          lodge_id?: string
          notes?: string | null
          org_id?: string
          outcome?: string | null
          planned_for?: string
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          approved_by: string | null
          attempts: number
          created_at: string
          domain_event_id: string | null
          dry_run: boolean
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          next_attempt_at: string
          org_id: string
          results: Json
          status: string
          workflow_id: string
        }
        Insert: {
          approved_by?: string | null
          attempts?: number
          created_at?: string
          domain_event_id?: string | null
          dry_run?: boolean
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          next_attempt_at?: string
          org_id: string
          results?: Json
          status?: string
          workflow_id: string
        }
        Update: {
          approved_by?: string | null
          attempts?: number
          created_at?: string
          domain_event_id?: string | null
          dry_run?: boolean
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          next_attempt_at?: string
          org_id?: string
          results?: Json
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_domain_event_id_fkey"
            columns: ["domain_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string
          enabled: boolean
          id: string
          is_system: boolean
          name: string
          org_id: string
          requires_approval: boolean
          trigger_key: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          enabled?: boolean
          id?: string
          is_system?: boolean
          name: string
          org_id: string
          requires_approval?: boolean
          trigger_key: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          enabled?: boolean
          id?: string
          is_system?: boolean
          name?: string
          org_id?: string
          requires_approval?: boolean
          trigger_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_event_attendance: {
        Row: {
          attended: number | null
          average_rating: number | null
          cancelled: number | null
          capacity: number | null
          event_id: string | null
          feedback_count: number | null
          is_training: boolean | null
          kind: string | null
          no_show: number | null
          org_id: string | null
          registered: number | null
          starts_at: string | null
          status: string | null
          title: string | null
          waitlisted: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_learning_records: {
        Row: {
          completed_at: string | null
          course_id: string | null
          course_title: string | null
          display_name: string | null
          due_on: string | null
          enrolled_at: string | null
          id: string | null
          lessons_completed: number | null
          lessons_required: number | null
          lodge_id: string | null
          org_id: string | null
          person_id: string | null
          source: string | null
          status: string | null
          version_no: number | null
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_member_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lodge_overview: {
        Row: {
          apgmen: string | null
          apgmen_person_id: string | null
          area: string | null
          area_id: string | null
          cover_apgmen: string | null
          id: string | null
          last_contact_on: string | null
          last_review_on: string | null
          lodge_mentor: string | null
          lodge_mentor_confirmed: boolean | null
          meeting_centre: string | null
          meeting_pattern: string | null
          membership_count: number | null
          mentoring_status: string | null
          mentoring_status_changed_at: string | null
          mentoring_status_key: string | null
          name: string | null
          next_review_on: string | null
          number: number | null
          open_requests: number | null
          open_tasks: number | null
          org_id: string | null
          personal_mentors_for_new_members: string | null
          secretary: string | null
          status: string | null
          town: string | null
          worshipful_master: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_member_overview: {
        Row: {
          area_id: string | null
          display_name: string | null
          email: string | null
          exalted_on: string | null
          first_name: string | null
          id: string | null
          initiated_on: string | null
          journey_status: string | null
          last_name: string | null
          lodge_id: string | null
          lodge_name: string | null
          lodge_number: number | null
          membership_number: string | null
          next_review_on: string | null
          org_id: string | null
          passed_on: string | null
          personal_mentor_allocated: string | null
          raised_on: string | null
          royal_arch: string | null
          stage: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodge_memberships_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "lodges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodge_memberships_lodge_id_fkey"
            columns: ["lodge_id"]
            isOneToOne: false
            referencedRelation: "v_lodge_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      academy_admin_enrol: {
        Args: { p_course: string; p_due?: string; p_person: string }
        Returns: string
      }
      academy_complete_lesson: {
        Args: { p_enrolment: string; p_lesson: string; p_reflection?: string }
        Returns: string
      }
      academy_enrol: { Args: { p_course: string }; Returns: string }
      academy_issue_recognition: {
        Args: {
          p_completed_on: string
          p_course?: string
          p_person: string
          p_reason: string
          p_title: string
        }
        Returns: string
      }
      academy_learner_context: { Args: { p_person: string }; Returns: Json }
      academy_learning_filters: { Args: never; Returns: Json }
      academy_learning_records: {
        Args: {
          p_area?: string
          p_course?: string
          p_from?: string
          p_limit?: number
          p_lodge?: string
          p_person?: string
          p_q?: string
          p_role?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          area_id: string
          area_name: string
          completed_at: string
          course_id: string
          course_title: string
          display_name: string
          due_on: string
          enrolled_at: string
          enrolment_id: string
          lessons_completed: number
          lessons_required: number
          lodge_id: string
          lodge_name: string
          lodge_number: number
          person_id: string
          roles: string[]
          source: string
          status: string
          version_no: number
        }[]
      }
      academy_new_version: { Args: { p_course: string }; Returns: string }
      academy_submit_assessment: {
        Args: { p_answers: Json; p_enrolment: string; p_lesson: string }
        Returns: Json
      }
      academy_transition_version: {
        Args: { p_note?: string; p_to: string; p_version: string }
        Returns: undefined
      }
      academy_withdraw: { Args: { p_enrolment: string }; Returns: undefined }
      account_request_contact_change: {
        Args: { p_details: string }
        Returns: string
      }
      account_set_status: {
        Args: { p_account: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_bootstrap_org: { Args: { p_org: string }; Returns: undefined }
      admin_create_invitation: {
        Args: {
          p_email: string
          p_first: string
          p_last: string
          p_message?: string
          p_person: string
          p_roles: string[]
          p_title: string
          p_token_hash: string
        }
        Returns: Json
      }
      admin_generate_quarterly: {
        Args: { p_org: string; p_quarter: number; p_year: number }
        Returns: string
      }
      admin_notify: {
        Args: {
          p_account: string
          p_body?: string
          p_dedupe?: string
          p_essential?: boolean
          p_link?: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      admin_record_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
          p_org: string
        }
        Returns: undefined
      }
      admin_report_period_data: {
        Args: { p_end: string; p_org: string; p_start: string }
        Returns: Json
      }
      admin_resend_invitation: {
        Args: { p_invitation: string; p_token_hash: string }
        Returns: Json
      }
      admin_revoke_invitation: {
        Args: { p_invitation: string }
        Returns: undefined
      }
      allocate_lodge: {
        Args: {
          p_ends?: string
          p_kind?: string
          p_lodge: string
          p_person: string
          p_reason?: string
          p_starts?: string
          p_transfer_open_work?: boolean
        }
        Returns: string
      }
      calendar_feed_events: {
        Args: { p_token_hash: string }
        Returns: {
          description: string
          ends_at: string
          id: string
          kind: string
          location: string
          starts_at: string
          status: string
          title: string
        }[]
      }
      campaign_cancel: { Args: { p_campaign: string }; Returns: undefined }
      campaign_decide: {
        Args: { p_approve: boolean; p_campaign: string; p_note?: string }
        Returns: string
      }
      campaign_preview_audience: {
        Args: { p_campaign: string }
        Returns: {
          email: string
          excluded_reason: string
          name: string
          person_id: string
        }[]
      }
      campaign_submit: { Args: { p_campaign: string }; Returns: string }
      case_escalate: {
        Args: { p_case: string; p_note: string; p_to_account: string }
        Returns: undefined
      }
      case_grant_access: {
        Args: { p_account: string; p_case: string; p_reason: string }
        Returns: undefined
      }
      case_triage: {
        Args: {
          p_action: string
          p_case: string
          p_note?: string
          p_owner?: string
          p_referred_to?: string
        }
        Returns: undefined
      }
      document_acknowledge: { Args: { p_version: string }; Returns: undefined }
      document_transition_version: {
        Args: { p_note?: string; p_to: string; p_version: string }
        Returns: undefined
      }
      end_allocation: {
        Args: { p_allocation: string; p_effective?: string }
        Returns: undefined
      }
      end_provincial_appointment: {
        Args: { p_effective?: string; p_person: string; p_reason?: string }
        Returns: Json
      }
      event_cancel: {
        Args: { p_event: string; p_reason: string }
        Returns: undefined
      }
      event_cancel_registration: {
        Args: { p_registration: string }
        Returns: undefined
      }
      event_check_in_code: { Args: { p_code: string }; Returns: Json }
      event_check_in_session: {
        Args: { p_event: string; p_secret: string }
        Returns: Json
      }
      event_complete: { Args: { p_event: string }; Returns: undefined }
      event_feedback: {
        Args: { p_comment: string; p_rating: number; p_registration: string }
        Returns: undefined
      }
      event_register: { Args: { p_event: string }; Returns: Json }
      event_register_person: {
        Args: { p_event: string; p_person: string }
        Returns: Json
      }
      event_set_attendance: {
        Args: { p_reason?: string; p_registration: string; p_status: string }
        Returns: undefined
      }
      event_set_checkin: {
        Args: { p_event: string; p_open: boolean; p_rotate?: boolean }
        Returns: string
      }
      feature_set_activation: {
        Args: {
          p_actions: Json
          p_active: boolean
          p_feature: string
          p_reason: string
          p_scope: string
          p_target: string
        }
        Returns: string
      }
      import_cancel: { Args: { p_batch: string }; Returns: undefined }
      import_commit: { Args: { p_batch: string }; Returns: Json }
      import_stage: {
        Args: {
          p_batch: string
          p_rows: Json
          p_scope?: string[]
          p_stats: Json
          p_template?: string
        }
        Returns: number
      }
      integration_failure_resolve: {
        Args: { p_failure: string; p_retry: boolean }
        Returns: string
      }
      knowledge_publish: { Args: { p_article: string }; Returns: undefined }
      learning_person_roles: {
        Args: never
        Returns: {
          person_id: string
          role_name: string
        }[]
      }
      lodge_learning: {
        Args: { p_lodge: string }
        Returns: {
          account_status: string
          courses: Json
          display_name: string
          last_sign_in_at: string
          person_id: string
        }[]
      }
      log_export: {
        Args: {
          p_dataset: string
          p_filters: Json
          p_format: string
          p_rows: number
        }
        Returns: undefined
      }
      log_sensitive_access: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: undefined
      }
      management_accounts: {
        Args: never
        Returns: {
          display_name: string
          id: string
          roles: string
        }[]
      }
      my_context: { Args: never; Returns: Json }
      my_portal_scope: { Args: never; Returns: Json }
      outbox_retry: { Args: { p_id: string }; Returns: undefined }
      person_clear_correction: {
        Args: { p_field: string; p_person: string }
        Returns: undefined
      }
      person_record_correction: {
        Args: {
          p_field: string
          p_person: string
          p_reason: string
          p_value: string
        }
        Returns: undefined
      }
      record_lodge_appointment: {
        Args: {
          p_confirmed?: boolean
          p_lodge: string
          p_office: string
          p_person: string
          p_starts?: string
        }
        Returns: string
      }
      record_sign_in: { Args: never; Returns: undefined }
      report_generate_quarterly: {
        Args: { p_quarter: number; p_year: number }
        Returns: string
      }
      report_period_data: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      report_quarterly_transition: {
        Args: { p_report: string; p_to: string }
        Returns: undefined
      }
      request_self_registration: {
        Args: { p_email: string; p_org: string; p_token_hash: string }
        Returns: Json
      }
      retention_run: {
        Args: { p_dry_run?: boolean; p_policy: string }
        Returns: Json
      }
      search_all: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          href: string
          id: string
          kind: string
          subtitle: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transfer_open_work: {
        Args: { p_from_account: string; p_reason: string; p_to_account: string }
        Returns: Json
      }
      unsubscribe_by_token: {
        Args: { p_scope?: string; p_token: string }
        Returns: boolean
      }
      workflow_run_decide: {
        Args: { p_approve: boolean; p_run: string }
        Returns: undefined
      }
      workflow_run_retry: { Args: { p_run: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


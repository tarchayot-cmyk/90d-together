export type CampaignLevel = "me" | "we" | "us";

export type StickerColor = "green" | "pink" | "yellow" | "red" | "purple" | "orange" | "rainbow";

export interface Member {
  id: string;
  employee_code: string;
  full_name: string;
  nickname: string | null;
  unit: string | null;
  department: string | null;
  avatar_url: string | null;
  role: "participant" | "admin" | "super_admin";
  is_active: boolean;
}

export interface Mission {
  id: string;
  campaign_id: string;
  level: CampaignLevel;
  category: string;
  name: string;
  description: string | null;
  target_value: number;
  unit: string;
  points: number;
  sticker_color: StickerColor | null;
  sticker_amount: number;
  requires_proof: boolean;
  is_active: boolean;
  input_type: "numeric" | "checkbox";
}

export interface CheckIn {
  id: string;
  mission_id: string;
  member_id: string;
  campaign_week: number;
  value: number;
  completed_at: string | null;
  proof_status: "not_required" | "pending" | "approved" | "rejected";
}

export interface CompleteMissionResult {
  success: boolean;
  completed?: boolean;
  progress?: number;
  target?: number;
  points?: number;
  sticker?: { type: StickerColor; amount: number } | null;
  achievement?: { code: string } | null;
  message?: string;
  error?: string;
}

export interface TreeState {
  level: number; // 1 = ME, 2 = WE, 3 = US
  progress: number; // 0-1, overall
  me: number; // 0-1
  we: number; // 0-1
  us: number; // 0-1
}

export interface DashboardData {
  member: Member;
  tree: TreeState;
  weeklyMissions: (Mission & { checkIn: CheckIn | null })[];
  totalPoints: number;
  buddy: { groupName: string; members: { name: string; progress: number }[] } | null;
  squad: { squadName: string; memberCount: number; progress: number } | null;
}

export type TransactionType = 'send' | 'receive' | 'paybill';

export interface Transaction {
  id?: string;
  uid: string;
  amount: number;
  type: TransactionType;
  date: string;
  description?: string;
  createdAt: string;
}

export interface CreditScore {
  uid: string;
  score: number;
  explanation: string;
  updatedAt: string;
}

export interface Insight {
  uid: string;
  totalIncome: number;
  totalExpenses: number;
  savingsPotential: number;
  message: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

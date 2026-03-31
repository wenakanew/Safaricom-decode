import { Transaction, Insight, CreditScore, TransactionType } from "../types";

export function calculateInsights(transactions: Transaction[], uid: string): Insight {
  const totalIncome = transactions
    .filter((t) => t.type === TransactionType.INCOME || t.type === TransactionType.RECEIVE)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === TransactionType.EXPENSE || t.type === TransactionType.SEND || t.type === TransactionType.PAYBILL)
    .reduce((sum, t) => sum + t.amount, 0);

  const savingsPotential = Math.max(0, totalIncome - totalExpenses);

  const summary = savingsPotential > 0 
    ? `You've saved $${savingsPotential.toLocaleString()} this month!` 
    : "Your expenses are higher than your income.";

  const message = savingsPotential > 0 
    ? `Great job! You've saved ${savingsPotential} this month! Keep it up.` 
    : "Your expenses are higher than your income. Let's look for ways to save.";

  return {
    uid,
    totalIncome,
    totalExpenses,
    savingsPotential,
    summary,
    message,
    updatedAt: new Date().toISOString(),
  };
}

export function calculateCreditScore(transactions: Transaction[], uid: string): CreditScore {
  // Simple scoring system:
  // 1. Transaction frequency (max 40 points)
  // 2. Income consistency (max 30 points)
  // 3. Savings ratio (max 30 points)

  const transactionCount = transactions.length;
  const frequencyScore = Math.min(40, (transactionCount / 20) * 40);

  const incomeTransactions = transactions.filter((t) => t.type === TransactionType.INCOME || t.type === TransactionType.RECEIVE);
  const incomeConsistencyScore = Math.min(30, (incomeTransactions.length / 5) * 30);

  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === TransactionType.EXPENSE || t.type === TransactionType.SEND || t.type === TransactionType.PAYBILL)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const savingsRatio = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;
  const savingsScore = Math.min(30, Math.max(0, savingsRatio * 30));

  const totalScore = Math.round((frequencyScore + incomeConsistencyScore + savingsScore) * 10); // Scale to 1000

  let rating = "";
  let explanation = "";
  if (totalScore > 800) {
    rating = "Excellent";
    explanation = "Excellent! You have a very healthy financial profile.";
  } else if (totalScore > 500) {
    rating = "Good";
    explanation = "Good. Your financial habits are stable, but there's room for more savings.";
  } else {
    rating = "Fair";
    explanation = "Fair. Try to increase your transaction frequency and save more to improve your score.";
  }

  return {
    uid,
    score: totalScore,
    rating,
    explanation,
    updatedAt: new Date().toISOString(),
  };
}

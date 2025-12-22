# Referral Code Verification Guide

## 📊 Models Used

### 1. **ReferralCodes Model** (`src/models/events/referral-codes.ts`)
Stores referral code definitions:
- `eventId` - Which event this code belongs to
- `code` - The referral code string (unique, uppercase)
- `discountPercentage` - Discount percentage (0-100)
- `isActive` - Whether code is currently active
- `usageCount` - Number of times code has been used
- `maxUses` - Maximum number of uses (null = unlimited)

### 2. **Bookings Model** (`src/models/events/bookings.ts`)
Stores booking records with referral code tracking:
- `referralCode` - The referral code used (if any)
- `discountAmount` - The discount amount applied (in currency)
- `subTotal` - Original total before discount
- `total` - Final amount paid (after discount)

---

## ✅ How to Verify User Got Discount

### Method 1: Query Bookings Directly

```javascript
// Check if a specific booking used a referral code
const booking = await Bookings.findOne({
  bookingRef: "JZ-ABC123",
  referralCode: { $exists: true, $ne: null }
})

if (booking && booking.referralCode) {
  console.log("✅ Discount Applied!")
  console.log("Referral Code:", booking.referralCode)
  console.log("Discount Amount: $", booking.discountAmount)
  console.log("Subtotal: $", booking.subTotal)
  console.log("Final Total: $", booking.total)
  console.log("Savings: $", booking.subTotal - booking.total)
}
```

### Method 2: Query All Bookings with Discounts for an Event

```javascript
// Get all bookings that used referral codes for an event
const bookingsWithDiscounts = await Bookings.find({
  eventId: eventId,
  referralCode: { $exists: true, $ne: null },
  discountAmount: { $gt: 0 }
}).select({
  bookingRef: 1,
  customerName: 1,
  customerEmail: 1,
  referralCode: 1,
  discountAmount: 1,
  subTotal: 1,
  total: 1,
  createdAt: 1
})

console.log(`Found ${bookingsWithDiscounts.length} bookings with discounts`)
```

### Method 3: Verify Specific Referral Code Usage

```javascript
// Get all bookings that used a specific referral code
const code = "SAVE20"
const bookings = await Bookings.find({
  referralCode: code.toUpperCase(),
  eventId: eventId
})

const totalDiscountGiven = bookings.reduce((sum, booking) => {
  return sum + (booking.discountAmount || 0)
}, 0)

console.log(`Code "${code}" used ${bookings.length} times`)
console.log(`Total discount given: $${totalDiscountGiven.toFixed(2)}`)
```

### Method 4: Database Query Examples

```javascript
// MongoDB queries you can run in MongoDB Compass or shell:

// 1. Find bookings with discounts
db.Bookings.find({ 
  referralCode: { $exists: true },
  discountAmount: { $gt: 0 }
})

// 2. Get discount statistics for an event
db.Bookings.aggregate([
  { $match: { eventId: ObjectId("..."), referralCode: { $exists: true } } },
  { $group: {
      _id: "$referralCode",
      count: { $sum: 1 },
      totalDiscount: { $sum: "$discountAmount" },
      avgDiscount: { $avg: "$discountAmount" }
    }
  }
])

// 3. Verify discount calculation
// Check: subtotal - discountAmount should equal total (approximately, considering Stripe fees)
db.Bookings.find({
  referralCode: { $exists: true },
  $expr: {
    $gt: [
      { $subtract: ["$subTotal", "$discountAmount"] },
      "$total"
    ]
  }
})
```

---

## 🚫 How to Know When Limit is Exceeded

### Method 1: Check in ReferralCodesManager UI
In the admin panel (`/console/events/[eventId]/manage` → Referral Codes tab):
- **Usage column** shows current usage count
- **Max Uses column** shows: `X (Y remaining)` if limit set, or `Unlimited`
- When limit is reached, it shows: `X (0 remaining)`

### Method 2: Check via API/Code

```javascript
const referralCode = await ReferralCodes.findOne({
  code: "SAVE20",
  eventId: eventId
})

if (referralCode) {
  const isExceeded = referralCode.maxUses !== null && 
                     referralCode.usageCount >= referralCode.maxUses
  
  if (isExceeded) {
    console.log("❌ Limit exceeded!")
    console.log(`Used: ${referralCode.usageCount} / ${referralCode.maxUses}`)
  } else {
    console.log("✅ Still available")
    const remaining = referralCode.maxUses - referralCode.usageCount
    console.log(`${remaining} uses remaining`)
  }
}
```

### Method 3: Check During Validation (Happens Automatically)

The system automatically checks limits in two places:

1. **During Checkout** (`src/pages/api/checkout/index.ts`):
```javascript
// Line 178-180
if (codeRecord.maxUses !== null && 
    codeRecord.maxUses !== undefined && 
    codeRecord.usageCount >= codeRecord.maxUses) {
  return sendResponse(res, null, "Referral code has reached maximum uses", false, ResCode.BAD_REQUEST)
}
```

2. **During Code Validation** (`src/pages/api/events/[eventId]/referral-codes/validate.ts`):
```javascript
// Line 38-40
if (referralCode.maxUses !== null && referralCode.usageCount >= referralCode.maxUses) {
  return sendResponse(res, null, "Referral code has reached maximum uses", false, ResCode.BAD_REQUEST)
}
```

### Method 4: Monitor in Real-Time

```javascript
// Set up monitoring script
const checkCodeStatus = async (code: string, eventId: string) => {
  const referralCode = await ReferralCodes.findOne({
    code: code.toUpperCase(),
    eventId: eventId
  })
  
  if (!referralCode) {
    return { status: "NOT_FOUND" }
  }
  
  if (!referralCode.isActive) {
    return { status: "INACTIVE" }
  }
  
  if (referralCode.maxUses !== null && referralCode.usageCount >= referralCode.maxUses) {
    return { 
      status: "LIMIT_EXCEEDED",
      usageCount: referralCode.usageCount,
      maxUses: referralCode.maxUses
    }
  }
  
  return {
    status: "ACTIVE",
    usageCount: referralCode.usageCount,
    maxUses: referralCode.maxUses,
    remaining: referralCode.maxUses === null 
      ? "Unlimited" 
      : referralCode.maxUses - referralCode.usageCount
  }
}
```

---

## 📈 Example: Complete Verification Workflow

```javascript
// Example: Verify all aspects of a referral code

async function verifyReferralCode(code: string, eventId: string) {
  // 1. Check code status
  const referralCode = await ReferralCodes.findOne({
    code: code.toUpperCase(),
    eventId: eventId
  })
  
  if (!referralCode) {
    return { error: "Code not found" }
  }
  
  // 2. Check if limit exceeded
  const isExceeded = referralCode.maxUses !== null && 
                     referralCode.usageCount >= referralCode.maxUses
  
  // 3. Get all bookings that used this code
  const bookings = await Bookings.find({
    referralCode: code.toUpperCase(),
    eventId: eventId
  }).sort({ createdAt: -1 })
  
  // 4. Calculate statistics
  const stats = {
    code: referralCode.code,
    discountPercentage: referralCode.discountPercentage,
    isActive: referralCode.isActive,
    usageCount: referralCode.usageCount,
    maxUses: referralCode.maxUses,
    isExceeded: isExceeded,
    remainingUses: referralCode.maxUses === null 
      ? "Unlimited" 
      : Math.max(0, referralCode.maxUses - referralCode.usageCount),
    totalBookings: bookings.length,
    totalDiscountGiven: bookings.reduce((sum, b) => sum + (b.discountAmount || 0), 0),
    bookings: bookings.map(b => ({
      bookingRef: b.bookingRef,
      customerEmail: b.customerEmail,
      discountAmount: b.discountAmount,
      subTotal: b.subTotal,
      finalTotal: b.total,
      date: b.createdAt
    }))
  }
  
  return stats
}

// Usage:
const verification = await verifyReferralCode("SAVE20", "eventId123")
console.log(verification)
```

---

## 🔍 Quick Verification Queries

### Check if discount was applied correctly:
```javascript
// The discount should match: subTotal × (discountPercentage / 100)
const booking = await Bookings.findOne({ bookingRef: "JZ-..." })
const referralCode = await ReferralCodes.findOne({ code: booking.referralCode })

const expectedDiscount = booking.subTotal * (referralCode.discountPercentage / 100)
const actualDiscount = booking.discountAmount

// Should be equal (within rounding tolerance)
const isCorrect = Math.abs(expectedDiscount - actualDiscount) < 0.01
```

### Find all codes that have exceeded limits:
```javascript
const exceededCodes = await ReferralCodes.find({
  maxUses: { $ne: null },
  $expr: { $gte: ["$usageCount", "$maxUses"] }
})
```

### Get discount summary for an event:
```javascript
const summary = await Bookings.aggregate([
  { 
    $match: { 
      eventId: ObjectId(eventId),
      referralCode: { $exists: true }
    }
  },
  {
    $group: {
      _id: "$referralCode",
      count: { $sum: 1 },
      totalDiscount: { $sum: "$discountAmount" },
      totalRevenue: { $sum: "$total" }
    }
  }
])
```

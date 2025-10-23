# Check-In System - Quick Reference Guide

## 🚀 Quick Start

### Access Check-In Portal

1. Login as admin
2. Go to event management: `/console/events/[eventId]/manage`
3. Click **"Check-In Portal"** button
4. Start checking in guests!

---

## 📋 API Quick Reference

### Validate Booking

```bash
POST /api/check-in/validate
{
  "eventId": "EVENT_ID",
  "identifier": "email@example.com OR JZ-ABC123"
}
```

### Record Check-In

```bash
POST /api/check-in/record
{
  "bookingId": "BOOKING_ID",
  "eventId": "EVENT_ID",
  "count": 2
}
```

### Get Statistics

```bash
GET /api/check-in/stats?eventId=EVENT_ID
```

---

## 🎯 Common Use Cases

### Scenario 1: Single Guest Check-In

1. Enter email: `john@example.com`
2. Click "Validate"
3. Verify details shown
4. Count defaults to 1
5. Click "Check In"
6. ✅ Success!

### Scenario 2: Group Check-In

1. Enter booking ref: `JZ-ABC123`
2. Click "Validate"
3. Set count to 5 (using number input)
4. Click "Check In"
5. ✅ 5 guests checked in!

### Scenario 3: Partial Group Arrival

1. First arrival: Check in 3 guests
2. Status shows: "Partially Checked In"
3. Later: Search same booking
4. Check in 2 more guests
5. If all checked in → "Fully Checked In"

### Scenario 4: Scan QR Code (Future)

1. Click "📷 Scan" button
2. Allow camera access
3. Point at QR code
4. Click "Capture & Scan"
5. System auto-validates
6. Proceed to check in

---

## ⚠️ Error Messages

| Error                                        | Meaning               | Solution                              |
| -------------------------------------------- | --------------------- | ------------------------------------- |
| "No booking found"                           | Invalid email/ref     | Check spelling, verify booking exists |
| "Cannot check in X guests. Only Y remaining" | Over-check-in attempt | Reduce count to Y or less             |
| "Unauthorized"                               | Not logged in         | Login as admin                        |
| "Access denied. Admin only"                  | Not admin role        | Use admin account                     |
| "Event ID and identifier are required"       | Missing data          | Provide both fields                   |

---

## 📊 Statistics Explained

| Metric             | Description                            |
| ------------------ | -------------------------------------- |
| **Total Bookings** | Number of unique bookings/reservations |
| **Total Tickets**  | All tickets purchased across bookings  |
| **Checked In**     | Number of guests who have arrived      |
| **Remaining**      | Tickets not yet checked in             |
| **Check-In %**     | Percentage of tickets checked in       |

---

## 🔧 Troubleshooting

### Camera Not Working?

- Check browser permissions
- Use HTTPS (required)
- Try different browser
- Use manual entry instead

### Booking Not Found?

- Verify correct event
- Check email spelling
- Try booking reference instead
- Ensure booking is confirmed

### Check-In Not Saving?

- Check internet connection
- Verify you're logged in
- Check count is valid
- Refresh page and retry

### Stats Not Updating?

- Wait 30 seconds (auto-refresh)
- Manually refresh page
- Check browser console

---

## 📱 Mobile Tips

- Use landscape for better view
- Tap anywhere in input to focus
- Swipe to access keyboard
- Use camera for faster scanning
- Bookmark page for quick access

---

## 🎨 Status Badges

| Badge                       | Meaning                |
| --------------------------- | ---------------------- |
| 🟢 **Fully Checked In**     | All tickets used       |
| 🟡 **Partially Checked In** | Some tickets remaining |
| ⚪ **Not Checked In**       | No check-ins yet       |

---

## 🔐 Security Notes

- Only admins can access
- All actions logged with admin name
- Cannot modify past check-ins
- History preserved for audit

---

## 📞 Support

**Issues?** Check:

1. This guide
2. Full documentation: `/CHECK_IN_SYSTEM.md`
3. Browser console for errors
4. Network tab in DevTools

---

## ⌨️ Keyboard Shortcuts

- **Enter** (in search) → Validate booking
- **Tab** → Navigate between fields
- **Esc** (in camera modal) → Close camera

---

## 🎯 Best Practices

1. **Start with email search** - Faster than typing booking ref
2. **Verify name** - Always confirm guest identity
3. **Check remaining count** - Before recording check-in
4. **Review history** - If guest claims they checked in
5. **Use camera** - For faster throughput (when available)
6. **Keep device charged** - Long events drain battery

---

## 📈 Statistics Interpretation

**Example:**

```
Total Bookings: 50
Total Tickets: 150
Checked In: 120 (80%)
Remaining: 30
```

**Means:**

- 50 people made reservations
- They bought 150 tickets total (groups)
- 120 guests have arrived
- 30 guests yet to arrive
- 80% attendance so far

---

## 🎪 Event Day Workflow

### Before Event:

1. Open check-in portal
2. Bookmark page
3. Test with sample booking
4. Verify stats showing correctly

### During Event:

1. Keep portal open
2. Validate each attendee
3. Check in guests as they arrive
4. Monitor statistics periodically

### After Event:

1. Review final statistics
2. Export data (future feature)
3. Check for no-shows
4. Close portal

---

## 💡 Pro Tips

- **Dual Device**: Use tablet for check-in, phone for backup
- **Network**: Ensure stable internet connection
- **Battery**: Keep charger handy
- **Lighting**: Good lighting for camera scanning
- **Queue Management**: Set up clear signage for check-in line
- **Staff Training**: Train backup staff on system

---

**Last Updated:** October 23, 2025  
**Version:** 1.0.0

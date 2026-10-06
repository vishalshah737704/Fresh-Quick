---
source: guide
audience: admin
title: Admin portal guide
---

## How do I sign in as an administrator?

Open the admin sign-in page, enter your email and password and choose Log in. Admin accounts cannot be created from the sign-in page.

## What is in the admin menu?

The left menu has Overview, Orders, Vendors and Delivery Partners. It also shows your name with a Reset password link, and Sign out.

## What does the Overview page show?

Above the cards is the Automatic order acceptance (demo mode) checkbox (see the questions below). Three cards: Active orders (orders not yet Delivered, Cancelled or Rejected), Vendors (the number of stores) and Revenue (the total of all orders except Cancelled and Rejected ones).

## How do I find and filter orders?

Open Orders. The table lists Order, Customer, Store, Status, Amount, Partner and Placed time. Use the "All statuses" filter to show one status only. Choose an order number to open its detail page.

## How do I see one order in detail?

Choose the order number on the Orders page. The detail page shows the order's items, status and timeline, and the delivery partner (or Unassigned).

## How do I reassign an order to a different delivery partner?

1. Open the order's detail page. The reassign controls appear only while the order is Partner assigned or On the way.
2. Pick a partner from the "Select partner…" list, which shows online partners only.
3. Choose Reassign.

An offline partner is refused with "Delivery partner is not online".

## How do I add a vendor?

1. Open Vendors and choose "Add vendor".
2. Enter Store name, Owner name, Email, a Temporary password, Latitude and Longitude.
3. Choose "Create vendor". Share the temporary password with the vendor, who can change it from their profile.

## What do the vendor statuses mean?

Active means the store is open. Pending means it is not open yet, for example a new store with no available menu items. Paused means you have suspended it.

## How do I suspend or unsuspend a vendor?

On the Vendors page choose Suspend or Unsuspend in the vendor's row. Suspending closes the store and customers see "This restaurant is currently unavailable." Unsuspending lifts the pause, but the vendor must open the store again themselves.

## How do I add a delivery partner?

1. Open Delivery Partners and choose "Add delivery partner".
2. Enter Full name, Email, a Temporary password and the Vehicle (bike, scooter, bicycle or car).
3. Choose "Create delivery partner". Share the temporary password with the partner, who can change it from their profile.

The table lists each partner's Name, Online or Offline status and Vehicle.

## What is Automatic order acceptance (demo mode)?

On the Overview page there is a checkbox called Automatic order acceptance (demo mode). When it is ticked, every paid order moves by itself so the whole journey can be shown with nobody clicking: Accepted, Preparing, Ready, then Partner assigned (the nearest online delivery partner, as usual), then Picked up, each step about 3 seconds after the previous one. The customer's courier animation then delivers the order. Vendors do not have to accept or prepare anything and delivery partners do not have to mark an order picked up. It applies to orders from the website and the phone app. It is off by default.

## How do I turn Automatic order acceptance on or off?

Open Overview and tick or clear the checkbox Automatic order acceptance (demo mode); it saves at once. Ticking it also starts every order that is already open (placed and paid, accepted, preparing, ready or assigned). Clearing it stops further automatic steps; orders already in progress stay where they are and the vendor and delivery partner handle them by hand. If a message says n8n did not respond, the setting is saved but open orders were not started, so check that n8n is running. If no delivery partner is online, an order waits at Ready until one is assigned and is then picked up about 3 seconds later.

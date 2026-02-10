<!-- Working -->

-   If the user buys only from the paywall, he will only get the palm report, and everything else will be locked in the dashboard, except daily horoscope and elysia.
-   If the user buys any of the upsells, then that upsell will be unlocked in the dashboard.
-   The pack of 3 upsell will unlock everything.
-   The locked upsell will have a lock icon on the top right of their card, and a get button, which will open a pop-up saying get your <the upsell name report> at $6.99.
    - if the user buys it, then it will be unlocked.
-   All the user details filled in the onboarding will be saved in firebase, along with the images of their palm.
- if the user buys the 1-week or 2-week plan, then they will have 15 coins on their elysia chat.
- The 4-week plan will give them 30 coins.
- Each chat costs 3 coins, and if the coins are not sufficient, the user will be prompted to buy more coins, whose pop-up is already made.
- Elysia uses the palm image and other details from the firebase to answer the user's question.

# Upsells

1. 2026 Prediction - We have already save the prediction details of each sign. Use the user's ascendant sign to get his 2026 prediction. This cannot be done manually, it is automatically generated using the user's sign. And they can only see the report.

2. Birth Chart - This is also created once the user signs up, and they can only view it, not regenerate it. This is created using user's Date of Birth, Time of Birth and Place of Birth. If any of these 3 things are not provided by the user, prompt them to give the details, and then generate it. If the user has given all the details, and the chart is being generated, show a loding cricle on the birth chart report card and dont let the user open it until the chart is prepared.

3. Compatibility Test - This page is already made, just keep it locked until bought.

4. Palm Reading Report - This report is generated using the user's scanned palm, which is also saved in the firebase. This can be regenrated and always save the latest palm image on the firebase.

<!-- All Money Related things will be connected using stripe -->
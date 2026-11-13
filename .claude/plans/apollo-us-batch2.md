# Apollo US Batch 2: 10 a day

**Status:** approved by Deepak on 2026-11-13 ("Approve and schedule").
- **Scheduled task:** `apollo-us-batch2-enroll`, cron `30 9 16,17,19,20,23 11 *`, saved in Auto mode. First run: Mon Nov 16 at about 9:31 AM IST.
- **Each run:** enrolls only that day's group. It catches up a missed group, up to 20 contacts per run.
- **It enrolls nobody when:** the date is Nov 18 or after Nov 27, either sequence is off, there's any spam block, bounces add up to 2 or more, or any send failed.
- **Once all 50 are enrolled:** disable the task.

## Rules
- Google-hosted mail only (MX lookup on 2026-11-12). These are the first 25 eligible contacts per list, in Apollo's order.
- Excluded: anyone already in a sequence, the 12 held contacts, and Microsoft-hosted, gateway (Proofpoint) and other hosts.
- **10 a day:** 5 into "Wave 1 - US Agency Owners" and 5 into "Wave 1 - US Fractional Leaders".
- **Days:** Mon Nov 16, Tue Nov 17, Thu Nov 19, Fri Nov 20 and Mon Nov 23. Wed Nov 18 is skipped because Batch 1's 50 third emails fill that day.
- **Enrolled at 9:30 AM IST** (8 PM PT the evening before), so first emails go out in that day's Los Angeles morning window.
- **Safety gate before each day's enrollment:** skip the day and report if Wave 1 has 2 or more bounces, any spam block, or a failed send since the last run.

## Sending load (emails per day from deepak@firmaos.co; the limit is 50)
| Day | New | Follow-ups | Total |
|---|---|---|---|
| Mon Nov 16 | 10 | 0 | 10 |
| Tue Nov 17 | 10 | 0 | 10 |
| Wed Nov 18 | 0 | 50 (Batch 1, third email) | 50 |
| Thu Nov 19 | 10 | 10 | 20 |
| Fri Nov 20 | 10 | 10 | 20 |
| Mon Nov 23 | 10 | 20 | 30 |
| Wed Nov 25 to Mon Nov 30 | 0 | 10 to 20 a day | 20 or less |

Thanksgiving Day (Thu Nov 26) gets about 20 follow-ups.

## Mon Nov 16
| List | Name | Company | Email | Contact ID |
|---|---|---|---|---|
| Agency | Billy Ferguson | Geauxto Group | bferguson@geauxtogroup.com | `6aeca49c135de2000193dfa4` |
| Agency | Kelli Miller | klinx | kelli@klinxdigitalmarketingagency.com | `6aeca49c135de2000193dfa0` |
| Agency | Dean Palermo | Elettro | dpalermo@elettro.com | `6aeca49c135de2000193df94` |
| Agency | Brittanie Bengston | ThrivePOP | brittanie@thrivepop.com | `6aeca49c135de2000193df90` |
| Agency | Denis Sinelnikov | Media Components | denis@mediacomponents.com | `6aeca49c135de2000193df88` |
| Fractional | Tinne Teugels | Dyne Marketing | tinne@heydyne.com | `6aeca52c20bd050001197838` |
| Fractional | Michelle Hummel | Web Strategy Plus | michelle@webstrategyplus.com | `6aeca52c20bd050001197830` |
| Fractional | Samuel Clarke | Seguru Digital | samuel@seguru.digital | `6aeca52c20bd05000119782c` |
| Fractional | Corey Swann | Strategic Marketing and Execution | corey@stxmkt.com | `6aeca52c20bd050001197828` |
| Fractional | Neha Goel | Rippler Group | neha@ripplergroup.com | `6aeca52c20bd050001197824` |

## Tue Nov 17
| List | Name | Company | Email | Contact ID |
|---|---|---|---|---|
| Agency | Erica D'Arcangelo | Web Content Development | erica@webcontentdevelopment.com | `6aeca49c135de2000193df7c` |
| Agency | Abhishek Pastore | Get Me Rank | abhishek@getmerank.com | `6aeca49c135de2000193df78` |
| Agency | Lorraine Stewart | ROJEK Consulting | lstewart@rojekconsulting.com | `6aeca49c135de2000193df74` |
| Agency | Ilhami Goral | Magnero | igoral@magnero.com | `6aeca49c135de2000193df70` |
| Agency | Brooke Stites | MODERN ARTS | brooke@modernarts.com | `6aeca49c135de2000193df6c` |
| Fractional | Lisa Perry | Captivating Solutions Group | lisaperry@captivatingsolutionsgroup.com | `6aeca52c20bd050001197820` |
| Fractional | Jennifer Tamborski | Virtual Marketing Experts | jennifer@virtualmarketingexpert.com | `6aeca52c20bd05000119781c` |
| Fractional | Jordan Valentin | SweetTooth Digital | jordan@sweettoothdigital.com | `6aeca52c20bd050001197818` |
| Fractional | Ali Chapman | Thoughtful Growth Marketing | ali@thoughtfulgm.com | `6aeca52c20bd050001197814` |
| Fractional | Leslie Waller | Fire Opal Group | leslie@fireopalgroup.com | `6aeca52c20bd050001197810` |

## Thu Nov 19
| List | Name | Company | Email | Contact ID |
|---|---|---|---|---|
| Agency | Thomas Heed | EverEffect | thomas.heed@evereffect.com | `6aeca49c135de2000193df60` |
| Agency | Alina Demydova | IDEA Digital Marketing | alina@idea-digitalmarketing.com | `6aeca49c135de2000193df5c` |
| Agency | Brenton Thomas | Twibi | bthomas@twibiagency.com | `6aeca49c135de2000193df58` |
| Agency | Adam Fitzgerald | The Simple Machine | adam@thesimplemachine.co | `6aeca49c135de2000193df50` |
| Agency | Wayne Stewart | 401 Digital | wstewart@401digital.net | `6aeca49c135de2000193df40` |
| Fractional | Eran Livneh | MarketCapture | eran@marketcapture.com | `6aeca52c20bd050001197808` |
| Fractional | Marsha Funk | Funk Media | marsha@funkmediagroup.com | `6aeca52c20bd050001197804` |
| Fractional | Caleb Reinhold | Neutrino Marketing | caleb@neutrinomarketing.com | `6aeca52c20bd0500011977fc` |
| Fractional | Kim Snell | Leapcrest Marketing | kim@leapcrestmarketing.com | `6aeca52c20bd0500011977f8` |
| Fractional | Kari Switala | Wild Fig CMO | kari@gowildfig.com | `6aeca52c20bd0500011977f4` |

## Fri Nov 20
| List | Name | Company | Email | Contact ID |
|---|---|---|---|---|
| Agency | Rish Sharma | ICONIER | rish@iconier.com | `6aeca49c135de2000193df3c` |
| Agency | Disha Bhandari | Hiraya Digital | disha@hiraya.digital | `6aeca49c135de2000193df34` |
| Agency | Priscila Ertty | Voila Creative Agency | priscila@voilacreativeagency.com | `6aeca49c135de2000193df30` |
| Agency | James Loomstein | Rogue Marketing | james@gorogue.net | `6aeca49c135de2000193df20` |
| Agency | Ivan Vislavskiy | Comrade | ivan@comradeweb.com | `6aeca49c135de2000193df1c` |
| Fractional | Shelby Malvestuto | Sunhawk Marketing | shelby@sunhawkmarketing.com | `6aeca52c20bd0500011977f0` |
| Fractional | Darren Wilson | dw CMO | dw@dwcmo.com | `6aeca52c20bd0500011977e8` |
| Fractional | Jennifer Quiroz | Jennifer Quiroz Marketing | jennifer@jenniferquiroz.com | `6aeca52c20bd0500011977e4` |
| Fractional | Jessie Warner | ACHIEVE CMO | jessie@achievecmo.com | `6aeca52c20bd0500011977e0` |
| Fractional | Chris Dimacale | Marant Digital | chris.dimacale@marantdigital.com | `69f1a798847b2d000dfadd7c` |

## Mon Nov 23
| List | Name | Company | Email | Contact ID |
|---|---|---|---|---|
| Agency | Tim Janicki | S2S | tjanicki@s2smedia.net | `6aeca49c135de2000193df14` |
| Agency | Jessica Ireland | Sunshine & Bourbon | jireland@sunshineandbourbon.com | `6aeca49c135de2000193df10` |
| Agency | Alex Wells | Imprint Digital | alex@imprint-digital.com | `6aeca49c135de2000193df04` |
| Agency | Tzvi Twersky | Department of Athletics | t@departmentofathletics.com | `6aeca49c135de2000193df00` |
| Agency | Christy Hunter | Fishnet Marketing | christy@downtowndesignweb.com | `6aeca49c135de2000193def4` |
| Fractional | Teddy F | Northrop Consulting | teddy@northrop.llc | `69f09f50666055001d4ef4bf` |
| Fractional | Lou Hughes | Moving Minds | lou.hughes@movingminds.io | `69f08cc0eb3a8b001d8ac68c` |
| Fractional | David Varnai | Iolite Ventures | david@ioliteventures.co | `69f05269d0a49a0011159617` |
| Fractional | Jennifer Day | JDay Creative | jennifer@jdaymce.com | `69ef5d7cd0aff30019cf01a2` |
| Fractional | Brad Pitts | The Oaken Group | brad@theoakengroup.co | `69ef5bfba0d7770011b53ce2` |

## Left for Batch 3 (Google-hosted)
- Agency: Skyler Ryser, skyler@gorevity.com (`6aeca49c135de2000193def0`)
- Agency: Amanda Nagy, amanda@finnandgray.com (`6aeca49c135de2000193deec`)
- Fractional: Sarah Schariest, sarah@b2bmarketingadvisors.com (`69ef179d5d9a440021143256`)
- Fractional: Katie Hollar, katie@marketalchemist.com (`69ef1697c1ca040019dc44ed`)
- Fractional: Branden C, branden@marketingexec.us (`69eeff921376cc0015f3bc71`)

Batch 3 also has 30 Microsoft-hosted contacts (19 agency, 11 fractional). It goes ahead only if Batch 2 stays clean. The 7 Proofpoint gateway contacts and 14 others go last, and 12 stay held.

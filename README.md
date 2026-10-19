# WICHLIST

WICHLIST est une application web statique en HTML, CSS et JavaScript. Supabase fournit les comptes, la base de données et le stockage privé des images. Bootstrap 5 est chargé depuis jsDelivr; aucun outil de compilation n'est nécessaire.

## Fichiers

- `index.html` : wishlist de l'utilisateur connecté.
- `login.html` et `signup.html` : connexion et inscription.
- `add-product.html` et `edit-product.html` : création et modification d'un souhait.
- `js/` : client Supabase, authentification, opérations sur les souhaits et analyse des liens.
- `supabase/schema.sql` : table, règles de sécurité et bucket d'images privé.
- `supabase/functions/analyze-product/` : fonction serveur d'analyse facultative des métadonnées publiques.

## Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com/) et attendez la fin de son initialisation.
2. Dans le tableau de bord, ouvrez **SQL Editor**, créez une requête, collez le contenu de `supabase/schema.sql`, puis exécutez-la. Cela crée la table `wishes`, les règles RLS et le bucket privé `wish-images`.
3. Dans **Project Settings > API**, copiez le **Project URL** et la clé **publishable** (ou l'ancienne clé `anon` publique). Dans `js/supabase.js`, remplacez les deux valeurs `YOUR_...`.
   - Une clé publique/publishable peut être utilisée dans le navigateur avec les règles RLS ci-dessus.
   - Ne copiez jamais la clé `service_role` ni un secret dans un fichier du site.
4. Dans **Authentication > URL Configuration**, indiquez l'adresse de votre site comme **Site URL** et ajoutez les URL de développement et de production à **Redirect URLs**. Pour Live Server, l'adresse ressemble souvent à `http://127.0.0.1:5500/**`; adaptez le port affiché par votre serveur.
5. Dans **Authentication > Providers > Email**, choisissez si les nouveaux comptes doivent confirmer leur adresse par e-mail. Si la confirmation est activée, ouvrez le message reçu avant de vous connecter.

L'URL et la clé Supabase ne sont pas fournies dans le dépôt : vous devez les récupérer dans votre propre projet. Tant que les valeurs de `js/supabase.js` sont des exemples, l'application affiche un message de configuration et ne peut pas se connecter.

## Analyse des liens (facultatif)

L'analyse passe par une Supabase Edge Function et n'est jamais tentée directement depuis le navigateur. Elle ne lit que les métadonnées publiques accessibles, limite le délai, les redirections et la taille téléchargée, et refuse les URL qui pointent vers des adresses privées. Les marchands peuvent bloquer les requêtes ou ne pas publier de prix/image : dans ce cas, le formulaire reste utilisable manuellement. Aucun prix n'est actualisé après son relevé.

Pour déployer cette fonction, installez [Supabase CLI](https://supabase.com/docs/guides/cli), ouvrez un terminal dans le dossier `wichlist`, puis exécutez :

```powershell
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase functions deploy analyze-product
```

Le `project-ref` se trouve dans l'URL ou les paramètres du projet Supabase. Conservez la vérification JWT de la fonction activée (comportement par défaut); ne déployez pas avec `--no-verify-jwt`.

## Lancer le site

N'ouvrez pas les pages avec `file://`. Servez le dossier `wichlist` avec une extension de serveur local comme **Live Server** dans VS Code, puis ouvrez l'adresse HTTP qu'elle affiche. Créez un compte via `signup.html`, puis testez l'ajout avec ou sans lien, la modification et la suppression.

## Déploiement et GitHub

Le site peut être publié sur GitHub Pages, Netlify ou Cloudflare Pages comme site statique. Publiez le contenu de ce dossier, puis ajoutez son adresse HTTPS dans la configuration des URL Supabase décrite plus haut. Pour GitHub Pages, choisissez la branche et le dossier publiés dans **Settings > Pages**. La fonction d'analyse reste hébergée séparément sur Supabase.

Avant le premier déploiement, vérifiez que `js/supabase.js` ne contient que la clé publique et que le schéma SQL a bien été exécuté. Le fichier `.gitignore` exclut les fichiers locaux et secrets courants, mais ne remplace pas une vérification du contenu avant publication.

## Limites connues

- Les tests d'inscription, de base de données, d'upload et d'isolation entre comptes nécessitent un projet Supabase configuré; ils ne peuvent pas être exécutés depuis ce dépôt seul.
- Bootstrap, Supabase JS et les polices sont chargés depuis des CDN; une connexion internet est nécessaire pour l'interface complète.
- Le total converti utilise l'API publique Frankfurter et ses taux de référence de la BCE. La date du taux est affichée; si l'API est indisponible, le total indique que la conversion n'a pas pu être effectuée.
- Les URLs d'images distantes restent hébergées chez leur marchand. Les images importées sont privées et leurs liens signés expirent après une heure, puis sont recréés à l'ouverture de la wishlist.
- Le montant est enregistré en `NUMERIC(12, 2)`; les images importées sont limitées à 5 Mo et aux formats JPEG, PNG et WebP.
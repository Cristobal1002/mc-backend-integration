/**
 * Backfill de transaction.error para transacciones failed de abril/mayo sin detalle.
 *
 * Uso:
 *   node scripts/backfill-transaction-errors.js              # dry-run (solo muestra)
 *   node scripts/backfill-transaction-errors.js --apply      # escribe en BD
 *   node scripts/backfill-transaction-errors.js --apply --from=2026-04-01 --to=2026-05-31
 */
import 'dotenv/config';
import { Op } from 'sequelize';
import { sequelize } from '../src/database/index.js';
import { model } from '../src/models/index.js';
import {
    rebuildTransactionError,
    isMissingTransactionError,
} from '../src/utils/error-serializer.utils.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const fromDate = args.find((a) => a.startsWith('--from='))?.split('=')[1] || '2026-04-01';
const toDate = args.find((a) => a.startsWith('--to='))?.split('=')[1] || '2026-05-31';

const run = async () => {
    console.log(`\n=== Backfill transaction.error ===`);
    console.log(`Rango: ${fromDate} → ${toDate}`);
    console.log(`Modo: ${apply ? 'APLICAR CAMBIOS' : 'DRY-RUN (sin escribir)'}\n`);

    const candidates = await model.TransactionModel.findAll({
        where: {
            status: 'failed',
            document_date: { [Op.between]: [fromDate, toDate] },
        },
        order: [['document_date', 'ASC'], ['document_number', 'ASC']],
    });

    const damaged = candidates.filter((tx) => isMissingTransactionError(tx.error));

    console.log(`Total failed en rango: ${candidates.length}`);
    console.log(`Dañadas (sin error usable): ${damaged.length}\n`);

    if (damaged.length === 0) {
        console.log('No hay transacciones para reparar.');
        await sequelize.close();
        return;
    }

    let updated = 0;
    for (const tx of damaged) {
        const newError = rebuildTransactionError(tx.get({ plain: true }));

        console.log(`- ${tx.document_number} | ${tx.type} | ${tx.document_date}`);
        console.log(`  → ${newError.message}`);

        if (apply) {
            await tx.update({ error: newError });
            updated++;
        }
    }

    console.log(`\n${apply ? `Actualizadas: ${updated}` : `Se actualizarían: ${damaged.length} (usa --apply para escribir)`}`);
    await sequelize.close();
};

run().catch(async (err) => {
    console.error('Error en backfill:', err);
    await sequelize.close();
    process.exit(1);
});

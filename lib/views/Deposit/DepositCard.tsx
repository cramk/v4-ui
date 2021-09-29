import { Amount, Token, Transaction, useTransaction } from '@pooltogether/hooks'
import { useOnboard } from '@pooltogether/bnc-onboard-hooks'
import { PrizePool } from '@pooltogether/v4-js-client'
import { BridgeTokensModal } from 'lib/components/Modal/BridgeTokensModal'
import { GetTokensModal } from 'lib/components/Modal/GetTokensModal'
import { SelectedNetworkToggle } from 'lib/components/SelectedNetworkToggle'
import { getAmountFromString } from 'lib/utils/getAmountFromString'
import { useSelectedNetworkPlayer } from 'lib/hooks/Tsunami/Player/useSelectedNetworkPlayer'
import { usePrizePoolTokens } from 'lib/hooks/Tsunami/PrizePool/usePrizePoolTokens'
import { useSelectedNetworkPrizePool } from 'lib/hooks/Tsunami/PrizePool/useSelectedNetworkPrizePool'
import { useUsersDepositAllowance } from 'lib/hooks/Tsunami/PrizePool/useUsersDepositAllowance'
import { useUsersPrizePoolBalances } from 'lib/hooks/Tsunami/PrizePool/useUsersPrizePoolBalances'
import { useSendTransaction } from 'lib/hooks/useSendTransaction'
import { ContentPanesProps, ContentPaneState } from 'lib/views/DefaultPage'
import { ConfirmationModal } from 'lib/views/Deposit/ConfirmationModal'
import { DepositForm, DEPOSIT_FORM_KEY, TxHashRow } from 'lib/views/Deposit/DepositForm'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import BalloonsSvg from 'assets/images/success.svg'
import { Card } from '@pooltogether/react-components'

export const DepositCard = (props: ContentPanesProps) => {
  const { setSelectedPage } = props
  const { data: prizePool, isFetched: isPrizePoolFetched } = useSelectedNetworkPrizePool()
  const { data: player, isFetched: isPlayerFetched } = useSelectedNetworkPlayer()
  const { data: prizePoolTokens, isFetched: isPrizePoolTokensFetched } =
    usePrizePoolTokens(prizePool)
  const {
    data: usersBalances,
    refetch: refetchUsersBalances,
    isFetched: isUsersBalancesFetched
  } = useUsersPrizePoolBalances(prizePool)
  const {
    data: depositAllowance,
    refetch: refetchUsersDepositAllowance,
    isFetched: isUsersDepositAllowanceFetched
  } = useUsersDepositAllowance(prizePool)

  const isDataFetched =
    isPrizePoolFetched &&
    isPlayerFetched &&
    isPrizePoolTokensFetched &&
    isUsersBalancesFetched &&
    isUsersDepositAllowanceFetched

  const form = useForm({
    mode: 'onChange',
    reValidateMode: 'onChange'
  })

  const router = useRouter()

  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)

  const { t } = useTranslation()

  const sendTx = useSendTransaction()

  const [depositedAmount, setDepositedAmount] = useState<Amount>()

  const [transactionIds, setTransactionIds] = useState<{ [txIdKey: string]: number }>({})
  const getKey = (prizePool: PrizePool, action: string) => `${prizePool.id()}-${action}`

  const approveTxId = transactionIds?.[getKey(prizePool, 'approve')] || 0
  const depositTxId = transactionIds?.[getKey(prizePool, 'deposit')] || 0
  const completedDepositTxId = transactionIds?.[getKey(prizePool, 'completed-deposit')] || 0

  const approveTx = useTransaction(approveTxId)
  const depositTx = useTransaction(depositTxId)
  const completedDepositTx = useTransaction(completedDepositTxId)

  const setSpecificTxId = (txId: number, prizePool: PrizePool, action: string) =>
    setTransactionIds((prevState) => ({ ...prevState, [getKey(prizePool, action)]: txId }))
  const setApproveTxId = (txId: number, prizePool: PrizePool) =>
    setSpecificTxId(txId, prizePool, 'approve')
  const setDepositTxId = (txId: number, prizePool: PrizePool) =>
    setSpecificTxId(txId, prizePool, 'deposit')
  const setCompletedDepositTxId = (txId: number, prizePool: PrizePool) =>
    setSpecificTxId(txId, prizePool, 'completed-deposit')

  const token = prizePoolTokens?.token
  const ticket = prizePoolTokens?.ticket
  const tokenBalance = usersBalances?.token
  const ticketBalance = usersBalances?.ticket

  const { setValue, watch, reset } = form

  const quantity = watch(DEPOSIT_FORM_KEY)
  const amountToDeposit = useMemo(
    () => getAmountFromString(quantity, token?.decimals),
    [quantity, token?.decimals]
  )

  // Set quantity from the query parameter on mount
  useEffect(() => {
    try {
      const quantity = router.query[DEPOSIT_FORM_KEY]
      const quantityNum = Number(quantity)
      if (quantity && !isNaN(quantityNum)) {
        setValue(DEPOSIT_FORM_KEY, quantity, { shouldValidate: true })
      }
    } catch (e) {
      console.warn('Invalid query parameter for quantity')
    }
  }, [])

  // Move to completed state after successful deposit
  // useEffect(() => {
  //   console.log('depositTx', depositTx)
  //   if (depositTx && depositTx.completed && !depositTx.error && !depositTx.cancelled) {
  //     setCompletedDepositTxId(depositTx.id)
  //     setDepositedAmount(amountToDeposit)
  //     setDepositTxId(0)
  //     closeModal()
  //     resetQueryParam()
  //   }
  // }, [depositTx?.completed])

  const closeModal = () => {
    const { query, pathname } = router
    delete query.showConfirmModal
    router.replace({ pathname, query })
    setShowConfirmModal(false)
  }

  const sendApproveTx = async () => {
    const name = t(`allowTickerPool`, { ticker: token.symbol })
    const txId = await sendTx({
      name,
      method: 'approve',
      callTransaction: async () => player.approveDeposits(),
      callbacks: {
        refetch: () => refetchUsersDepositAllowance()
      }
    })
    setApproveTxId(txId, prizePool)
  }

  const sendDepositTx = async () => {
    const name = `${t('deposit')} ${amountToDeposit.amountPretty} ${token.symbol}`
    const txId = await sendTx({
      name,
      method: 'depositTo',
      callTransaction: async () => player.deposit(amountToDeposit.amountUnformatted),
      callbacks: {
        onSuccess: (tx: Transaction) => {
          console.log('SUCCESS', prizePool, tx)
          setDepositedAmount(amountToDeposit)
          setCompletedDepositTxId(tx.id, prizePool)
          setDepositTxId(0, prizePool)
          closeModal()
          resetQueryParam()
        },
        refetch: () => refetchUsersBalances()
      }
    })
    setDepositTxId(txId, prizePool)
  }

  const resetQueryParam = () => {
    const { query, pathname } = router
    delete query[DEPOSIT_FORM_KEY]
    router.replace({ pathname, query })
  }

  const resetState = () => {
    resetQueryParam()
    reset()
    setApproveTxId(0, prizePool)
    setDepositTxId(0, prizePool)
    setCompletedDepositTxId(0, prizePool)
    setDepositedAmount(undefined)
  }

  return (
    <>
      <Card>
        {completedDepositTx ? (
          <CompletedDeposit
            setSelectedPage={setSelectedPage}
            chainId={prizePool.chainId}
            resetState={resetState}
            tx={completedDepositTx}
            depositedAmount={depositedAmount}
            token={token}
          />
        ) : (
          <>
            <SelectedNetworkToggle className='mb-6 mx-auto' />
            <DepositForm
              form={form}
              player={player}
              isPlayerFetched={isPlayerFetched}
              prizePool={prizePool}
              isPrizePoolFetched={isPrizePoolFetched}
              token={token}
              ticket={ticket}
              isPrizePoolTokensFetched={isPrizePoolTokensFetched}
              approveTx={approveTx}
              depositTx={depositTx}
              isUsersBalancesFetched={isUsersBalancesFetched}
              tokenBalance={tokenBalance}
              ticketBalance={ticketBalance}
              isUsersDepositAllowanceFetched={isUsersDepositAllowanceFetched}
              depositAllowance={depositAllowance}
              setShowConfirmModal={setShowConfirmModal}
              amountToDeposit={amountToDeposit}
            />
            <div className='w-full flex justify-around mt-4'>
              <BridgeTokensModalTrigger prizePool={prizePool} />
              <GetTokensModalTrigger prizePool={prizePool} />
            </div>
          </>
        )}
      </Card>

      <ConfirmationModal
        isOpen={showConfirmModal}
        closeModal={closeModal}
        label='deposit confirmation modal'
        token={token}
        ticket={ticket}
        isDataFetched={isDataFetched}
        amountToDeposit={amountToDeposit}
        depositAllowance={depositAllowance}
        approveTx={approveTx}
        depositTx={depositTx}
        sendApproveTx={sendApproveTx}
        sendDepositTx={sendDepositTx}
        prizePool={prizePool}
        resetState={resetState}
      />
    </>
  )
}

interface ExternalLinkProps {
  prizePool: PrizePool
}

const GetTokensModalTrigger = (props: ExternalLinkProps) => {
  const { prizePool } = props
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        className='underline text-accent-1 hover:text-white transition-colors'
        onClick={() => setShowModal(true)}
      >
        Get tokens
      </button>
      <GetTokensModal
        label='Decentralized exchange modal'
        chainId={prizePool.chainId}
        tokenAddress={prizePool.tokenMetadata.address}
        isOpen={showModal}
        closeModal={() => setShowModal(false)}
      />
    </>
  )
}
const BridgeTokensModalTrigger = (props: ExternalLinkProps) => {
  const { prizePool } = props
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        className='underline text-accent-1 hover:text-white transition-colors'
        onClick={() => setShowModal(true)}
      >
        Bridge tokens
      </button>
      <BridgeTokensModal
        label='Ethereum to L2 bridge modal'
        chainId={prizePool.chainId}
        isOpen={showModal}
        closeModal={() => setShowModal(false)}
      />
    </>
  )
}

const SuccessBalloons = (props) => (
  <img src={BalloonsSvg} alt='check mark icon' width={64} className={props.className} />
)

interface CompletedDepositProps {
  chainId: number
  resetState: () => void
  depositedAmount: Amount
  tx: Transaction
  token: Token
  setSelectedPage: (page: ContentPaneState) => void
}

const CompletedDeposit = (props: CompletedDepositProps) => {
  const { resetState, depositedAmount, tx, token, chainId, setSelectedPage } = props
  const { t } = useTranslation()
  return (
    <div className='flex flex-col'>
      <SuccessBalloons className='mx-auto mb-6' />
      <p className='font-inter max-w-xs mx-auto opacity-80 text-center text-xl'>
        {t('successfullyDeposited', { amount: depositedAmount.amountPretty, ticker: token.symbol })}
      </p>
      <p className='font-inter font-semibold max-w-xs mx-auto text-center text-3xl mb-4 text-white'>
        {depositedAmount.amountPretty} {token.symbol}
      </p>
      <div className={'w-full px-4 py-2 bg-light-purple-10 rounded-lg text-accent-1'}>
        <TxHashRow depositTx={tx} chainId={chainId} />
      </div>
      <div className='w-full font-inter gradient-new text-center px-2 xs:px-4 py-1 my-4 text-xxxs rounded-lg text-white'>
        {t('disclaimerComeBackRegularlyToClaimWinnings')}
      </div>
      <button
        className='mx-auto text-xl text-accent-1 hover:text-white transition-colors mb-2'
        onClick={resetState}
      >
        Deposit more
      </button>
      <button
        className='mx-auto text-xs text-accent-1 hover:text-white transition-colors'
        onClick={() => setSelectedPage(ContentPaneState.account)}
      >
        View account
      </button>
    </div>
  )
}